import { Provider } from "@/provider/provider"
import { Config } from "@/config/config"
import { Log } from "@/util/log"
import { Context, Effect, Layer } from "effect"
import * as Stream from "effect/Stream"
import { streamText, type ModelMessage, type Tool } from "ai"
import type { MessageV2 } from "./message-v2"
import type { Agent } from "@/agent/agent"
import { Permission } from "@/permission"
import { ProviderTransform } from "@/provider/transform"
import { ModelID, ProviderID } from "@/provider/schema"

export namespace PlanPipeline {
  const log = Log.create({ service: "plan-pipeline" })

  export type StreamInput = {
    user: MessageV2.User
    sessionID: string
    parentSessionID?: string
    model: Provider.Model
    agent: Agent.Info
    permission?: Permission.Ruleset
    system: string[]
    messages: ModelMessage[]
    small?: boolean
    tools: Record<string, Tool>
    retries?: number
    toolChoice?: "auto" | "required" | "none"
  }

  export type StreamRequest = StreamInput & {
    abort: AbortSignal
  }

  export type Event = Awaited<ReturnType<typeof streamText>>["fullStream"] extends AsyncIterable<infer T> ? T : never

  export interface Interface {
    readonly stream: (input: StreamInput) => Stream.Stream<Event, unknown, never>
  }

  export class Service extends Context.Service<Service, Interface>()("@opencode/PlanPipeline") {}

  export const layer: Layer.Layer<Service, never, Config.Service | Provider.Service> = Layer.effect(
    Service,
    Effect.gen(function* () {
      const config = yield* Config.Service
      const provider = yield* Provider.Service

      const run = Effect.fn("PlanPipeline.run")(function* (input: StreamRequest) {
        const cfg = yield* config.get()
        const pipelineCfg = cfg.plan_pipeline || { enabled: false }

        if (!pipelineCfg.enabled || input.agent.name !== "plan") {
          return (yield* runSinglePhase(input, input.model)).stream
        }

        const models = pipelineCfg.models || {
          reasoner: "deepseek/deepseek-reasoner",
          generator: "qwen/qwen3-coder",
          checker: "deepseek/deepseek-reasoner",
        }

        const l = log
          .clone()
          .tag("sessionID", input.sessionID)
          .tag("agent", input.agent.name)
          .tag("pipeline", "enabled")
        l.info("starting multi-model plan pipeline")

        try {
          const reasonerModel = yield* getModelFromConfig(models.reasoner)
          const generatorModel = yield* getModelFromConfig(models.generator)
          const checkerModel = yield* getModelFromConfig(models.checker)

          l.info("phase models", {
            reasoner: `${reasonerModel.providerID}/${reasonerModel.id}`,
            generator: `${generatorModel.providerID}/${generatorModel.id}`,
            checker: `${checkerModel.providerID}/${checkerModel.id}`,
          })

          const reasoning = yield* runReasoningPhase(input, reasonerModel)
          const plan = yield* runGenerationPhase({ ...input, messages: reasoning.messages }, generatorModel)
          const validated = yield* runValidationPhase({ ...input, messages: plan.messages }, checkerModel)

          return validated.stream
        } catch (err) {
          l.warn("pipeline failed, falling back to single model", { error: String(err) })
          return (yield* runSinglePhase(input, input.model)).stream
        }
      })

      const getModelFromConfig = Effect.fn("PlanPipeline.getModelFromConfig")(function* (modelSpec: string) {
        const parsed = Provider.parseModel(modelSpec)
        return yield* provider.getModel(parsed.providerID, parsed.modelID)
      })

      const runSinglePhase = Effect.fn("PlanPipeline.runSinglePhase")(function* (
        input: StreamRequest,
        model: Provider.Model,
      ) {
        const l = log
          .clone()
          .tag("sessionID", input.sessionID)
          .tag("model", `${model.providerID}/${model.id}`)
          .tag("pipeline", "single")
        l.info("running single model plan generation")

        const language = yield* provider.getLanguage(model)

        const system = input.system
        const messages = input.messages

        const result = yield* Effect.sync(() =>
          streamText({
            model: language,
            system: system.join("\n"),
            messages,
            tools: input.tools,
            toolChoice: input.toolChoice,
            abortSignal: input.abort,
            maxOutputTokens: ProviderTransform.OUTPUT_TOKEN_MAX,
          }),
        )

        return {
          stream: Stream.fromAsyncIterable(result.fullStream, () => {}),
          messages: [...messages],
        }
      })

      const runReasoningPhase = Effect.fn("PlanPipeline.runReasoningPhase")(function* (
        input: StreamRequest,
        model: Provider.Model,
      ) {
        const l = log
          .clone()
          .tag("phase", "reasoning")
          .tag("model", `${model.providerID}/${model.id}`)
        l.info("starting reasoning phase")

        const reasoningPrompt = [
          "You are in the reasoning phase of plan generation.",
          "Analyze the user's request and the codebase context to understand:",
          "1. What needs to be implemented",
          "2. Key technical challenges",
          "3. Relevant existing patterns in the codebase",
          "4. Potential edge cases",
          "Provide a concise reasoning analysis that will inform the plan generation phase.",
        ]

        const phaseInput = {
          ...input,
          model,
          system: [...input.system, ...reasoningPrompt],
        }

        const result = yield* runSinglePhase(phaseInput, model)
        l.info("reasoning phase complete")
        return result
      })

      const runGenerationPhase = Effect.fn("PlanPipeline.runGenerationPhase")(function* (
        input: StreamRequest,
        model: Provider.Model,
      ) {
        const l = log
          .clone()
          .tag("phase", "generation")
          .tag("model", `${model.providerID}/${model.id}`)
        l.info("starting plan generation phase")

        const generationPrompt = [
          "You are in the plan generation phase.",
          "Based on the reasoning analysis, create a detailed implementation plan that includes:",
          "1. Step-by-step implementation approach",
          "2. Files to be created/modified",
          "3. Key functions/classes to implement",
          "4. Testing strategy",
          "5. Verification steps",
          "Generate a comprehensive plan that can be executed by a build agent.",
        ]

        const phaseInput = {
          ...input,
          model,
          system: [...input.system, ...generationPrompt],
        }

        const result = yield* runSinglePhase(phaseInput, model)
        l.info("generation phase complete")
        return result
      })

      const runValidationPhase = Effect.fn("PlanPipeline.runValidationPhase")(function* (
        input: StreamRequest,
        model: Provider.Model,
      ) {
        const l = log
          .clone()
          .tag("phase", "validation")
          .tag("model", `${model.providerID}/${model.id}`)
        l.info("starting plan validation phase")

        const validationPrompt = [
          "You are in the plan validation phase.",
          "Review the generated plan and check for:",
          "1. Completeness - does it address all requirements?",
          "2. Technical correctness - are there any technical issues?",
          "3. Consistency with codebase patterns",
          "4. Missing edge cases or error handling",
          "5. Feasibility of implementation steps",
          "Provide validation feedback and confirm if the plan is ready for execution.",
        ]

        const phaseInput = {
          ...input,
          model,
          system: [...input.system, ...validationPrompt],
        }

        const result = yield* runSinglePhase(phaseInput, model)
        l.info("validation phase complete")
        return result
      })

      return Service.of({
        stream: (input: StreamInput) =>
          Stream.unwrap(
            Effect.gen(function* () {
              const cfg = yield* config.get()
              const pipelineCfg = cfg.plan_pipeline || { enabled: false }

              if (!pipelineCfg.enabled || input.agent.name !== "plan") {
                const result = yield* runSinglePhase({ ...input, abort: new AbortController().signal }, input.model)
                return result.stream
              }

              const controller = new AbortController()
              const result = yield* run({ ...input, abort: controller.signal })
              return result
            }),
          ),
      })
    }),
  )

  export const defaultLayer = Layer.suspend(() =>
    layer.pipe(Layer.provide(Config.defaultLayer), Layer.provide(Provider.defaultLayer)),
  )
}