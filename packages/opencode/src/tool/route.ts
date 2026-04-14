import z from "zod"
import { Effect } from "effect"
import { Tool } from "./tool"
import { Session } from "../session"
import { MessageV2 } from "../session/message-v2"
import { Provider } from "../provider/provider"
import { Agent } from "../agent/agent"
import { MessageID, PartID } from "../session/schema"

const parameters = z.object({
  agent: z
    .string()
    .describe(
      "Name of the specialist agent to hand off to (e.g. architect, builder, executor, migration-planner, reviewer)",
    ),
  context: z
    .string()
    .describe(
      "Full task context to pass to the specialist. Include the user's original request and your classification reasoning so the specialist has everything it needs without asking the user to repeat themselves.",
    ),
})

function getLastModel(sessionID: string) {
  for (const item of MessageV2.stream(sessionID as any)) {
    if (item.info.role === "user" && item.info.model) return item.info.model
  }
  return undefined
}

export const RouteTool = Tool.define(
  "route",
  Effect.gen(function* () {
    const session = yield* Session.Service
    const provider = yield* Provider.Service
    const agentSvc = yield* Agent.Service

    return {
      description:
        "Hand off the current conversation to a specialist agent. The specialist receives the provided context and responds immediately — the user does not need to reprompt. Use this instead of spawning a subagent when the task requires an interactive back-and-forth with the user.",
      parameters,
      execute: (params: z.infer<typeof parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const allAgents = yield* agentSvc.list()
          const target = allAgents.find((a) => a.name === params.agent)
          if (!target) {
            const names = allAgents.map((a) => a.name).join(", ")
            return {
              title: "Route failed",
              output: `No agent named "${params.agent}". Available agents: ${names}`,
              metadata: {},
            }
          }

          const model = getLastModel(ctx.sessionID) ?? (yield* provider.defaultModel())

          const msg: MessageV2.User = {
            id: MessageID.ascending(),
            sessionID: ctx.sessionID,
            role: "user",
            time: { created: Date.now() },
            agent: params.agent,
            model,
          }
          yield* session.updateMessage(msg)
          yield* session.updatePart({
            id: PartID.ascending(),
            messageID: msg.id,
            sessionID: ctx.sessionID,
            type: "text",
            text: params.context,
            synthetic: true,
          } satisfies MessageV2.TextPart)

          return {
            title: `→ @${params.agent}`,
            output: `Handed off to @${params.agent}.`,
            metadata: {},
          }
        }).pipe(Effect.orDie),
    }
  }),
)
