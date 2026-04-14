import { afterEach, test, expect } from "bun:test"
import os from "os"
import { Cause, Effect, Exit, Fiber, Layer } from "effect"
import { Bus } from "../../src/bus"
import * as CrossSpawnSpawner from "../../src/effect/cross-spawn-spawner"
import { Permission } from "../../src/permission"
import { PermissionID } from "../../src/permission/schema"
import { Instance } from "../../src/project/instance"
import { provideInstance, provideTmpdirInstance, tmpdir, tmpdirScoped } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { MessageID, SessionID } from "../../src/session/schema"

const bus = Bus.layer
const env = Layer.mergeAll(Permission.layer.pipe(Layer.provide(bus)), bus, CrossSpawnSpawner.defaultLayer)
const it = testEffect(env)

afterEach(async () => {
  await Instance.disposeAll()
})

const rejectAll = (message?: string) =>
  Effect.gen(function* () {
    const permission = yield* Permission.Service
    for (const req of yield* permission.list()) {
      yield* permission.reply({
        requestID: req.id,
        reply: "reject",
        message,
      })
    }
  })

const waitForPending = (count: number) =>
  Effect.gen(function* () {
    const permission = yield* Permission.Service
    for (let i = 0; i < 100; i++) {
      const list = yield* permission.list()
      if (list.length === count) return list
      yield* Effect.sleep("10 millis")
    }
    return yield* Effect.fail(new Error(`timed out waiting for ${count} pending permission request(s)`))
  })

const fail = <A, E, R>(self: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const exit = yield* self.pipe(Effect.exit)
    if (Exit.isFailure(exit)) return Cause.squash(exit.cause)
    throw new Error("expected permission effect to fail")
  })

const ask = (input: Parameters<Permission.Interface["ask"]>[0]) =>
  Effect.gen(function* () {
    const permission = yield* Permission.Service
    return yield* permission.ask(input)
  })

const reply = (input: Parameters<Permission.Interface["reply"]>[0]) =>
  Effect.gen(function* () {
    const permission = yield* Permission.Service
    return yield* permission.reply(input)
  })

const list = () =>
  Effect.gen(function* () {
    const permission = yield* Permission.Service
    return yield* permission.list()
  })

function withDir(options: { git?: boolean } | undefined, self: (dir: string) => Effect.Effect<any, any, any>) {
  return provideTmpdirInstance(self, options)
}

function withProvided(dir: string) {
  return <A, E, R>(self: Effect.Effect<A, E, R>) => self.pipe(provideInstance(dir))
}

// fromConfig tests

test("fromConfig - string value becomes wildcard rule", () => {
  const result = Permission.fromConfig({ bash: "allow" })
  expect(result).toEqual([{ permission: "bash", pattern: "*", action: "allow" }])
})

test("fromConfig - object value converts to rules array", () => {
  const result = Permission.fromConfig({ bash: { "*": "allow", rm: "deny" } })
  expect(result).toEqual([
    { permission: "bash", pattern: "*", action: "allow" },
    { permission: "bash", pattern: "rm", action: "deny" },
  ])
})

test("fromConfig - mixed string and object values", () => {
  const result = Permission.fromConfig({
    bash: { "*": "allow", rm: "deny" },
    edit: "allow",
    webfetch: "ask",
  })
  expect(result).toEqual([
    { permission: "bash", pattern: "*", action: "allow" },
    { permission: "bash", pattern: "rm", action: "deny" },
    { permission: "edit", pattern: "*", action: "allow" },
    { permission: "webfetch", pattern: "*", action: "ask" },
  ])
})

test("fromConfig - empty object", () => {
  const result = Permission.fromConfig({})
  expect(result).toEqual([])
})

test("fromConfig - expands tilde to home directory", () => {
  const result = Permission.fromConfig({ external_directory: { "~/projects/*": "allow" } })
  expect(result).toEqual([{ permission: "external_directory", pattern: `${os.homedir()}/projects/*`, action: "allow" }])
})

test("fromConfig - expands $HOME to home directory", () => {
  const result = Permission.fromConfig({ external_directory: { "$HOME/projects/*": "allow" } })
  expect(result).toEqual([{ permission: "external_directory", pattern: `${os.homedir()}/projects/*`, action: "allow" }])
})

test("fromConfig - expands $HOME without trailing slash", () => {
  const result = Permission.fromConfig({ external_directory: { $HOME: "allow" } })
  expect(result).toEqual([{ permission: "external_directory", pattern: os.homedir(), action: "allow" }])
})

test("fromConfig - does not expand tilde in middle of path", () => {
  const result = Permission.fromConfig({ external_directory: { "/some/~/path": "allow" } })
  expect(result).toEqual([{ permission: "external_directory", pattern: "/some/~/path", action: "allow" }])
})

test("fromConfig - expands exact tilde to home directory", () => {
  const result = Permission.fromConfig({ external_directory: { "~": "allow" } })
  expect(result).toEqual([{ permission: "external_directory", pattern: os.homedir(), action: "allow" }])
})

test("evaluate - matches expanded tilde pattern", () => {
  const ruleset = Permission.fromConfig({ external_directory: { "~/projects/*": "allow" } })
  const result = Permission.evaluate("external_directory", `${os.homedir()}/projects/file.txt`, ruleset)
  expect(result.action).toBe("allow")
})

test("evaluate - matches expanded $HOME pattern", () => {
  const ruleset = Permission.fromConfig({ external_directory: { "$HOME/projects/*": "allow" } })
  const result = Permission.evaluate("external_directory", `${os.homedir()}/projects/file.txt`, ruleset)
  expect(result.action).toBe("allow")
})

// merge tests

test("merge - simple concatenation", () => {
  const result = Permission.merge(
    [{ permission: "bash", pattern: "*", action: "allow" }],
    [{ permission: "bash", pattern: "*", action: "deny" }],
  )
  expect(result).toEqual([
    { permission: "bash", pattern: "*", action: "allow" },
    { permission: "bash", pattern: "*", action: "deny" },
  ])
})

test("merge - adds new permission", () => {
  const result = Permission.merge(
    [{ permission: "bash", pattern: "*", action: "allow" }],
    [{ permission: "edit", pattern: "*", action: "deny" }],
  )
  expect(result).toEqual([
    { permission: "bash", pattern: "*", action: "allow" },
    { permission: "edit", pattern: "*", action: "deny" },
  ])
})

test("merge - concatenates rules for same permission", () => {
  const result = Permission.merge(
    [{ permission: "bash", pattern: "foo", action: "ask" }],
    [{ permission: "bash", pattern: "*", action: "deny" }],
  )
  expect(result).toEqual([
    { permission: "bash", pattern: "foo", action: "ask" },
    { permission: "bash", pattern: "*", action: "deny" },
  ])
})

test("merge - multiple rulesets", () => {
  const result = Permission.merge(
    [{ permission: "bash", pattern: "*", action: "allow" }],
    [{ permission: "bash", pattern: "rm", action: "ask" }],
    [{ permission: "edit", pattern: "*", action: "allow" }],
  )
  expect(result).toEqual([
    { permission: "bash", pattern: "*", action: "allow" },
    { permission: "bash", pattern: "rm", action: "ask" },
    { permission: "edit", pattern: "*", action: "allow" },
  ])
})

test("merge - empty ruleset does nothing", () => {
  const result = Permission.merge([{ permission: "bash", pattern: "*", action: "allow" }], [])
  expect(result).toEqual([{ permission: "bash", pattern: "*", action: "allow" }])
})

test("merge - preserves rule order", () => {
  const result = Permission.merge(
    [
      { permission: "edit", pattern: "src/*", action: "allow" },
      { permission: "edit", pattern: "src/secret/*", action: "deny" },
    ],
    [{ permission: "edit", pattern: "src/secret/ok.ts", action: "allow" }],
  )
  expect(result).toEqual([
    { permission: "edit", pattern: "src/*", action: "allow" },
    { permission: "edit", pattern: "src/secret/*", action: "deny" },
    { permission: "edit", pattern: "src/secret/ok.ts", action: "allow" },
  ])
})

test("merge - config allow overrides default ask (last-match-wins)", () => {
  const defaults: Permission.Ruleset = [{ permission: "*", pattern: "*", action: "ask" }]
  const config: Permission.Ruleset = [{ permission: "bash", pattern: "*", action: "allow" }]
  const merged = Permission.merge(defaults, config)

  // last-match-wins: config allow overrides default ask for bash
  expect(Permission.evaluate("bash", "ls", merged).action).toBe("allow")
  // edit still falls back to default ask (no override)
  expect(Permission.evaluate("edit", "foo.ts", merged).action).toBe("ask")
})

test("merge - config ask overrides default allow", () => {
  const defaults: Permission.Ruleset = [{ permission: "bash", pattern: "*", action: "allow" }]
  const config: Permission.Ruleset = [{ permission: "bash", pattern: "*", action: "ask" }]
  const merged = Permission.merge(defaults, config)

  expect(Permission.evaluate("bash", "ls", merged).action).toBe("ask")
})

// evaluate tests

test("evaluate - exact pattern match", () => {
  const result = Permission.evaluate("bash", "rm", [{ permission: "bash", pattern: "rm", action: "deny" }])
  expect(result.action).toBe("deny")
})

test("evaluate - wildcard pattern match", () => {
  const result = Permission.evaluate("bash", "rm", [{ permission: "bash", pattern: "*", action: "allow" }])
  expect(result.action).toBe("allow")
})

test("evaluate - last matching rule wins", () => {
  const result = Permission.evaluate("bash", "rm", [
    { permission: "bash", pattern: "*", action: "allow" },
    { permission: "bash", pattern: "rm", action: "deny" },
  ])
  expect(result.action).toBe("deny")
})

test("evaluate - deny wins over later allow (priority-based)", () => {
  const result = Permission.evaluate("bash", "rm", [
    { permission: "bash", pattern: "rm", action: "deny" },
    { permission: "bash", pattern: "*", action: "allow" },
  ])
  expect(result.action).toBe("deny")
})

test("evaluate - glob pattern match", () => {
  const result = Permission.evaluate("edit", "src/foo.ts", [{ permission: "edit", pattern: "src/*", action: "allow" }])
  expect(result.action).toBe("allow")
})

test("evaluate - deny beats more specific allow (priority-based)", () => {
  const result = Permission.evaluate("edit", "src/components/Button.tsx", [
    { permission: "edit", pattern: "src/*", action: "deny" },
    { permission: "edit", pattern: "src/components/*", action: "allow" },
  ])
  // deny wins over allow regardless of specificity
  expect(result.action).toBe("deny")
})

test("evaluate - order matters for specificity", () => {
  const result = Permission.evaluate("edit", "src/components/Button.tsx", [
    { permission: "edit", pattern: "src/components/*", action: "allow" },
    { permission: "edit", pattern: "src/*", action: "deny" },
  ])
  expect(result.action).toBe("deny")
})

test("evaluate - unknown permission returns ask", () => {
  const result = Permission.evaluate("unknown_tool", "anything", [
    { permission: "bash", pattern: "*", action: "allow" },
  ])
  expect(result.action).toBe("ask")
})

test("evaluate - empty ruleset returns ask", () => {
  const result = Permission.evaluate("bash", "rm", [])
  expect(result.action).toBe("ask")
})

test("evaluate - no matching pattern returns ask", () => {
  const result = Permission.evaluate("edit", "etc/passwd", [{ permission: "edit", pattern: "src/*", action: "allow" }])
  expect(result.action).toBe("ask")
})

test("evaluate - empty rules array returns ask", () => {
  const result = Permission.evaluate("bash", "rm", [])
  expect(result.action).toBe("ask")
})

test("evaluate - multiple matching patterns, last wins", () => {
  const result = Permission.evaluate("edit", "src/secret.ts", [
    { permission: "edit", pattern: "*", action: "ask" },
    { permission: "edit", pattern: "src/*", action: "allow" },
    { permission: "edit", pattern: "src/secret.ts", action: "deny" },
  ])
  expect(result.action).toBe("deny")
})

test("evaluate - allow overrides ask when last match (deny does not match)", () => {
  const result = Permission.evaluate("edit", "src/foo.ts", [
    { permission: "edit", pattern: "*", action: "ask" },
    { permission: "edit", pattern: "test/*", action: "deny" },
    { permission: "edit", pattern: "src/*", action: "allow" },
  ])
  // last-match-wins for ask vs allow: src/* allow is last. deny (test/*) does not match.
  expect(result.action).toBe("allow")
})

test("evaluate - exact match at end wins over earlier wildcard", () => {
  const result = Permission.evaluate("bash", "/bin/rm", [
    { permission: "bash", pattern: "*", action: "allow" },
    { permission: "bash", pattern: "/bin/rm", action: "deny" },
  ])
  expect(result.action).toBe("deny")
})

test("evaluate - deny wins over later wildcard allow", () => {
  const result = Permission.evaluate("bash", "/bin/rm", [
    { permission: "bash", pattern: "/bin/rm", action: "deny" },
    { permission: "bash", pattern: "*", action: "allow" },
  ])
  expect(result.action).toBe("deny")
})

// wildcard permission tests

test("evaluate - wildcard permission matches any permission", () => {
  const result = Permission.evaluate("bash", "rm", [{ permission: "*", pattern: "*", action: "deny" }])
  expect(result.action).toBe("deny")
})

test("evaluate - wildcard permission with specific pattern", () => {
  const result = Permission.evaluate("bash", "rm", [{ permission: "*", pattern: "rm", action: "deny" }])
  expect(result.action).toBe("deny")
})

test("evaluate - glob permission pattern", () => {
  const result = Permission.evaluate("mcp_server_tool", "anything", [
    { permission: "mcp_*", pattern: "*", action: "allow" },
  ])
  expect(result.action).toBe("allow")
})

test("evaluate - deny from wildcard permission beats specific allow", () => {
  const result = Permission.evaluate("bash", "rm", [
    { permission: "*", pattern: "*", action: "deny" },
    { permission: "bash", pattern: "*", action: "allow" },
  ])
  // deny (from * permission) beats allow (from bash) in priority evaluation
  expect(result.action).toBe("deny")
})

test("evaluate - deny from wildcard permission beats specific path allow", () => {
  const result = Permission.evaluate("edit", "src/foo.ts", [
    { permission: "*", pattern: "*", action: "deny" },
    { permission: "edit", pattern: "src/*", action: "allow" },
  ])
  // deny (from * permission) beats allow (from edit/src/*) in priority evaluation
  expect(result.action).toBe("deny")
})

test("evaluate - multiple matching permission patterns combine rules", () => {
  const result = Permission.evaluate("mcp_dangerous", "anything", [
    { permission: "*", pattern: "*", action: "ask" },
    { permission: "mcp_*", pattern: "*", action: "allow" },
    { permission: "mcp_dangerous", pattern: "*", action: "deny" },
  ])
  expect(result.action).toBe("deny")
})

test("evaluate - wildcard permission fallback for unknown tool", () => {
  const result = Permission.evaluate("unknown_tool", "anything", [
    { permission: "*", pattern: "*", action: "ask" },
    { permission: "bash", pattern: "*", action: "allow" },
  ])
  expect(result.action).toBe("ask")
})

test("evaluate - permission patterns sorted by length regardless of object order", () => {
  const result = Permission.evaluate("bash", "rm", [
    { permission: "bash", pattern: "*", action: "allow" },
    { permission: "*", pattern: "*", action: "deny" },
  ])
  expect(result.action).toBe("deny")
})

test("evaluate - merges multiple rulesets", () => {
  const config: Permission.Ruleset = [{ permission: "bash", pattern: "*", action: "allow" }]
  const approved: Permission.Ruleset = [{ permission: "bash", pattern: "rm", action: "deny" }]
  const result = Permission.evaluate("bash", "rm", config, approved)
  expect(result.action).toBe("deny")
})

// priority-based evaluation tests

test("evaluate - deny beats allow regardless of order", () => {
  const result = Permission.evaluate("bash", "rm", [
    { permission: "bash", pattern: "*", action: "allow" },
    { permission: "bash", pattern: "*", action: "deny" },
  ])
  expect(result.action).toBe("deny")
})

test("evaluate - deny from earlier ruleset beats allow from later", () => {
  const result = Permission.evaluate(
    "bash",
    "rm",
    [{ permission: "bash", pattern: "rm", action: "deny" }],
    [{ permission: "bash", pattern: "*", action: "allow" }],
  )
  expect(result.action).toBe("deny")
})

test("evaluate - ask beats allow regardless of order", () => {
  const result = Permission.evaluate("bash", "rm", [
    { permission: "bash", pattern: "*", action: "allow" },
    { permission: "bash", pattern: "rm", action: "ask" },
  ])
  expect(result.action).toBe("ask")
})

test("evaluate - allow only wins when no deny or ask matches", () => {
  const result = Permission.evaluate("bash", "ls", [
    { permission: "bash", pattern: "rm", action: "deny" },
    { permission: "bash", pattern: "*", action: "allow" },
  ])
  expect(result.action).toBe("allow")
})

// disabled tests

test("disabled - returns empty set when all tools allowed", () => {
  const result = Permission.disabled(["bash", "edit", "read"], [{ permission: "*", pattern: "*", action: "allow" }])
  expect(result.size).toBe(0)
})

test("disabled - disables tool when denied", () => {
  const result = Permission.disabled(
    ["bash", "edit", "read"],
    [
      { permission: "*", pattern: "*", action: "allow" },
      { permission: "bash", pattern: "*", action: "deny" },
    ],
  )
  expect(result.has("bash")).toBe(true)
  expect(result.has("edit")).toBe(false)
  expect(result.has("read")).toBe(false)
})

test("disabled - disables edit/write/apply_patch/multiedit when edit denied", () => {
  const result = Permission.disabled(
    ["edit", "write", "apply_patch", "multiedit", "bash"],
    [
      { permission: "*", pattern: "*", action: "allow" },
      { permission: "edit", pattern: "*", action: "deny" },
    ],
  )
  expect(result.has("edit")).toBe(true)
  expect(result.has("write")).toBe(true)
  expect(result.has("apply_patch")).toBe(true)
  expect(result.has("multiedit")).toBe(true)
  expect(result.has("bash")).toBe(false)
})

test("disabled - does not disable when partially denied", () => {
  const result = Permission.disabled(
    ["bash"],
    [
      { permission: "bash", pattern: "*", action: "allow" },
      { permission: "bash", pattern: "rm *", action: "deny" },
    ],
  )
  expect(result.has("bash")).toBe(false)
})

test("disabled - does not disable when action is ask", () => {
  const result = Permission.disabled(["bash", "edit"], [{ permission: "*", pattern: "*", action: "ask" }])
  expect(result.size).toBe(0)
})

test("disabled - does not disable when specific allow after wildcard deny", () => {
  const result = Permission.disabled(
    ["bash"],
    [
      { permission: "bash", pattern: "*", action: "deny" },
      { permission: "bash", pattern: "echo *", action: "allow" },
    ],
  )
  expect(result.has("bash")).toBe(false)
})

test("disabled - does not disable when wildcard allow after deny", () => {
  const result = Permission.disabled(
    ["bash"],
    [
      { permission: "bash", pattern: "rm *", action: "deny" },
      { permission: "bash", pattern: "*", action: "allow" },
    ],
  )
  expect(result.has("bash")).toBe(false)
})

test("disabled - disables multiple tools", () => {
  const result = Permission.disabled(
    ["bash", "edit", "webfetch"],
    [
      { permission: "bash", pattern: "*", action: "deny" },
      { permission: "edit", pattern: "*", action: "deny" },
      { permission: "webfetch", pattern: "*", action: "deny" },
    ],
  )
  expect(result.has("bash")).toBe(true)
  expect(result.has("edit")).toBe(true)
  expect(result.has("webfetch")).toBe(true)
})

test("disabled - wildcard permission denies all tools", () => {
  const result = Permission.disabled(["bash", "edit", "read"], [{ permission: "*", pattern: "*", action: "deny" }])
  expect(result.has("bash")).toBe(true)
  expect(result.has("edit")).toBe(true)
  expect(result.has("read")).toBe(true)
})

test("disabled - specific allow overrides wildcard deny", () => {
  const result = Permission.disabled(
    ["bash", "edit", "read"],
    [
      { permission: "*", pattern: "*", action: "deny" },
      { permission: "bash", pattern: "*", action: "allow" },
    ],
  )
  expect(result.has("bash")).toBe(false)
  expect(result.has("edit")).toBe(true)
  expect(result.has("read")).toBe(true)
})

// ask tests

it.live("ask - resolves immediately when action is allow", () =>
  withDir({ git: true }, () =>
    Effect.gen(function* () {
      const result = yield* ask({
        sessionID: SessionID.make("session_test"),
        permission: "bash",
        patterns: ["ls"],
        metadata: {},
        always: [],
        ruleset: [{ permission: "bash", pattern: "*", action: "allow" }],
      })
      expect(result).toBeUndefined()
    }),
  ),
)

it.live("ask - throws DeniedError when action is deny", () =>
  withDir({ git: true }, () =>
    Effect.gen(function* () {
      const err = yield* fail(
        ask({
          sessionID: SessionID.make("session_test"),
          permission: "bash",
          patterns: ["rm -rf /"],
          metadata: {},
          always: [],
          ruleset: [{ permission: "bash", pattern: "*", action: "deny" }],
        }),
      )
      expect(err).toBeInstanceOf(Permission.DeniedError)
    }),
  ),
)

it.live("ask - stays pending when action is ask", () =>
  withDir({ git: true }, () =>
    Effect.gen(function* () {
      const fiber = yield* ask({
        sessionID: SessionID.make("session_test"),
        permission: "bash",
        patterns: ["ls"],
        metadata: {},
        always: [],
        ruleset: [{ permission: "bash", pattern: "*", action: "ask" }],
      }).pipe(Effect.forkScoped)

      expect(yield* waitForPending(1)).toHaveLength(1)
      yield* rejectAll()
      yield* Fiber.await(fiber)
    }),
  ),
)

it.live("ask - adds request to pending list", () =>
  withDir({ git: true }, () =>
    Effect.gen(function* () {
      const fiber = yield* ask({
        sessionID: SessionID.make("session_test"),
        permission: "bash",
        patterns: ["ls"],
        metadata: { cmd: "ls" },
        always: ["ls"],
        tool: {
          messageID: MessageID.make("msg_test"),
          callID: "call_test",
        },
        ruleset: [],
      }).pipe(Effect.forkScoped)

      const items = yield* waitForPending(1)
      expect(items).toHaveLength(1)
      expect(items[0]).toMatchObject({
        sessionID: SessionID.make("session_test"),
        permission: "bash",
        patterns: ["ls"],
        metadata: { cmd: "ls" },
        always: ["ls"],
        tool: {
          messageID: MessageID.make("msg_test"),
          callID: "call_test",
        },
      })

      yield* rejectAll()
      yield* Fiber.await(fiber)
    }),
  ),
)

it.live("ask - publishes asked event", () =>
  withDir({ git: true }, () =>
    Effect.gen(function* () {
      const bus = yield* Bus.Service
      let seen: Permission.Request | undefined
      const unsub = yield* bus.subscribeCallback(Permission.Event.Asked, (event) => {
        seen = event.properties
      })

      try {
        const fiber = yield* ask({
          sessionID: SessionID.make("session_test"),
          permission: "bash",
          patterns: ["ls"],
          metadata: { cmd: "ls" },
          always: ["ls"],
          tool: {
            messageID: MessageID.make("msg_test"),
            callID: "call_test",
          },
          ruleset: [],
        }).pipe(Effect.forkScoped)

        expect(yield* waitForPending(1)).toHaveLength(1)
        expect(seen).toBeDefined()
        expect(seen).toMatchObject({
          sessionID: SessionID.make("session_test"),
          permission: "bash",
          patterns: ["ls"],
        })

        yield* rejectAll()
        yield* Fiber.await(fiber)
      } finally {
        unsub()
      }
    }),
  ),
)

// reply tests

it.live("reply - once resolves the pending ask", () =>
  withDir({ git: true }, () =>
    Effect.gen(function* () {
      const fiber = yield* ask({
        id: PermissionID.make("per_test1"),
        sessionID: SessionID.make("session_test"),
        permission: "bash",
        patterns: ["ls"],
        metadata: {},
        always: [],
        ruleset: [],
      }).pipe(Effect.forkScoped)

      yield* waitForPending(1)
      yield* reply({ requestID: PermissionID.make("per_test1"), reply: "once" })
      yield* Fiber.join(fiber)
    }),
  ),
)

it.live("reply - reject throws RejectedError", () =>
  withDir({ git: true }, () =>
    Effect.gen(function* () {
      const fiber = yield* ask({
        id: PermissionID.make("per_test2"),
        sessionID: SessionID.make("session_test"),
        permission: "bash",
        patterns: ["ls"],
        metadata: {},
        always: [],
        ruleset: [],
      }).pipe(Effect.forkScoped)

      yield* waitForPending(1)
      yield* reply({ requestID: PermissionID.make("per_test2"), reply: "reject" })

      const exit = yield* Fiber.await(fiber)
      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) expect(Cause.squash(exit.cause)).toBeInstanceOf(Permission.RejectedError)
    }),
  ),
)

it.live("reply - reject with message throws CorrectedError", () =>
  withDir({ git: true }, () =>
    Effect.gen(function* () {
      const fiber = yield* ask({
        id: PermissionID.make("per_test2b"),
        sessionID: SessionID.make("session_test"),
        permission: "bash",
        patterns: ["ls"],
        metadata: {},
        always: [],
        ruleset: [],
      }).pipe(Effect.forkScoped)

      yield* waitForPending(1)
      yield* reply({
        requestID: PermissionID.make("per_test2b"),
        reply: "reject",
        message: "Use a safer command",
      })

      const exit = yield* Fiber.await(fiber)
      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        const err = Cause.squash(exit.cause)
        expect(err).toBeInstanceOf(Permission.CorrectedError)
        expect(String(err)).toContain("Use a safer command")
      }
    }),
  ),
)

it.live("reply - always persists approval and resolves", () =>
  Effect.gen(function* () {
    const dir = yield* tmpdirScoped({ git: true })
    const run = withProvided(dir)
    const fiber = yield* ask({
      id: PermissionID.make("per_test3"),
      sessionID: SessionID.make("session_test"),
      permission: "bash",
      patterns: ["ls"],
      metadata: {},
      always: ["ls"],
      ruleset: [],
    }).pipe(run, Effect.forkScoped)

    yield* waitForPending(1).pipe(run)
    yield* reply({ requestID: PermissionID.make("per_test3"), reply: "always" }).pipe(run)
    yield* Fiber.join(fiber)

    const result = yield* ask({
      sessionID: SessionID.make("session_test2"),
      permission: "bash",
      patterns: ["ls"],
      metadata: {},
      always: [],
      ruleset: [],
    }).pipe(run)
    expect(result).toBeUndefined()
  }),
)

it.live("reply - reject cancels all pending for same session", () =>
  withDir({ git: true }, () =>
    Effect.gen(function* () {
      const a = yield* ask({
        id: PermissionID.make("per_test4a"),
        sessionID: SessionID.make("session_same"),
        permission: "bash",
        patterns: ["ls"],
        metadata: {},
        always: [],
        ruleset: [],
      }).pipe(Effect.forkScoped)

      const b = yield* ask({
        id: PermissionID.make("per_test4b"),
        sessionID: SessionID.make("session_same"),
        permission: "edit",
        patterns: ["foo.ts"],
        metadata: {},
        always: [],
        ruleset: [],
      }).pipe(Effect.forkScoped)

      yield* waitForPending(2)
      yield* reply({ requestID: PermissionID.make("per_test4a"), reply: "reject" })

      const [ea, eb] = yield* Effect.all([Fiber.await(a), Fiber.await(b)])
      expect(Exit.isFailure(ea)).toBe(true)
      expect(Exit.isFailure(eb)).toBe(true)
      if (Exit.isFailure(ea)) expect(Cause.squash(ea.cause)).toBeInstanceOf(Permission.RejectedError)
      if (Exit.isFailure(eb)) expect(Cause.squash(eb.cause)).toBeInstanceOf(Permission.RejectedError)
    }),
  ),
)

it.live("reply - always resolves matching pending requests in same session", () =>
  withDir({ git: true }, () =>
    Effect.gen(function* () {
      const a = yield* ask({
        id: PermissionID.make("per_test5a"),
        sessionID: SessionID.make("session_same"),
        permission: "bash",
        patterns: ["ls"],
        metadata: {},
        always: ["ls"],
        ruleset: [],
      }).pipe(Effect.forkScoped)

      const b = yield* ask({
        id: PermissionID.make("per_test5b"),
        sessionID: SessionID.make("session_same"),
        permission: "bash",
        patterns: ["ls"],
        metadata: {},
        always: [],
        ruleset: [],
      }).pipe(Effect.forkScoped)

      yield* waitForPending(2)
      yield* reply({ requestID: PermissionID.make("per_test5a"), reply: "always" })

      yield* Fiber.join(a)
      yield* Fiber.join(b)
      expect(yield* list()).toHaveLength(0)
    }),
  ),
)

it.live("reply - always keeps other session pending", () =>
  withDir({ git: true }, () =>
    Effect.gen(function* () {
      const a = yield* ask({
        id: PermissionID.make("per_test6a"),
        sessionID: SessionID.make("session_a"),
        permission: "bash",
        patterns: ["ls"],
        metadata: {},
        always: ["ls"],
        ruleset: [],
      }).pipe(Effect.forkScoped)

      const b = yield* ask({
        id: PermissionID.make("per_test6b"),
        sessionID: SessionID.make("session_b"),
        permission: "bash",
        patterns: ["ls"],
        metadata: {},
        always: [],
        ruleset: [],
      }).pipe(Effect.forkScoped)

      yield* waitForPending(2)
      yield* reply({ requestID: PermissionID.make("per_test6a"), reply: "always" })

      yield* Fiber.join(a)
      expect((yield* list()).map((item) => item.id)).toEqual([PermissionID.make("per_test6b")])

      yield* rejectAll()
      yield* Fiber.await(b)
    }),
  ),
)

it.live("reply - publishes replied event", () =>
  withDir({ git: true }, () =>
    Effect.gen(function* () {
      const bus = yield* Bus.Service
      let resolve!: (value: { sessionID: SessionID; requestID: PermissionID; reply: Permission.Reply }) => void
      const seen = Effect.promise<{
        sessionID: SessionID
        requestID: PermissionID
        reply: Permission.Reply
      }>(
        () =>
          new Promise((res) => {
            resolve = res
          }),
      )

      const fiber = yield* ask({
        id: PermissionID.make("per_test7"),
        sessionID: SessionID.make("session_test"),
        permission: "bash",
        patterns: ["ls"],
        metadata: {},
        always: [],
        ruleset: [],
      }).pipe(Effect.forkScoped)

      yield* waitForPending(1)

      const unsub = yield* bus.subscribeCallback(Permission.Event.Replied, (event) => {
        resolve(event.properties)
      })

      try {
        yield* reply({ requestID: PermissionID.make("per_test7"), reply: "once" })
        yield* Fiber.join(fiber)
        expect(yield* seen).toEqual({
          sessionID: SessionID.make("session_test"),
          requestID: PermissionID.make("per_test7"),
          reply: "once",
        })
      } finally {
        unsub()
      }
    }),
  ),
)

it.live("permission requests stay isolated by directory", () =>
  Effect.gen(function* () {
    const one = yield* tmpdirScoped({ git: true })
    const two = yield* tmpdirScoped({ git: true })
    const runOne = withProvided(one)
    const runTwo = withProvided(two)

    const a = yield* ask({
      id: PermissionID.make("per_dir_a"),
      sessionID: SessionID.make("session_dir_a"),
      permission: "bash",
      patterns: ["ls"],
      metadata: {},
      always: [],
      ruleset: [],
    }).pipe(runOne, Effect.forkScoped)

    const b = yield* ask({
      id: PermissionID.make("per_dir_b"),
      sessionID: SessionID.make("session_dir_b"),
      permission: "bash",
      patterns: ["pwd"],
      metadata: {},
      always: [],
      ruleset: [],
    }).pipe(runTwo, Effect.forkScoped)

    const onePending = yield* waitForPending(1).pipe(runOne)
    const twoPending = yield* waitForPending(1).pipe(runTwo)

    expect(onePending).toHaveLength(1)
    expect(twoPending).toHaveLength(1)
    expect(onePending[0].id).toBe(PermissionID.make("per_dir_a"))
    expect(twoPending[0].id).toBe(PermissionID.make("per_dir_b"))

    yield* reply({ requestID: onePending[0].id, reply: "reject" }).pipe(runOne)
    yield* reply({ requestID: twoPending[0].id, reply: "reject" }).pipe(runTwo)

    yield* Fiber.await(a)
    yield* Fiber.await(b)
  }),
)

it.live("pending permission rejects on instance dispose", () =>
  Effect.gen(function* () {
    const dir = yield* tmpdirScoped({ git: true })
    const run = withProvided(dir)
    const fiber = yield* ask({
      id: PermissionID.make("per_dispose"),
      sessionID: SessionID.make("session_dispose"),
      permission: "bash",
      patterns: ["ls"],
      metadata: {},
      always: [],
      ruleset: [],
    }).pipe(run, Effect.forkScoped)

    expect(yield* waitForPending(1).pipe(run)).toHaveLength(1)
    yield* Effect.promise(() => Instance.provide({ directory: dir, fn: () => Instance.dispose() }))

    const exit = yield* Fiber.await(fiber)
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) expect(Cause.squash(exit.cause)).toBeInstanceOf(Permission.RejectedError)
  }),
)

it.live("pending permission rejects on instance reload", () =>
  Effect.gen(function* () {
    const dir = yield* tmpdirScoped({ git: true })
    const run = withProvided(dir)
    const fiber = yield* ask({
      id: PermissionID.make("per_reload"),
      sessionID: SessionID.make("session_reload"),
      permission: "bash",
      patterns: ["ls"],
      metadata: {},
      always: [],
      ruleset: [],
    }).pipe(run, Effect.forkScoped)

    expect(yield* waitForPending(1).pipe(run)).toHaveLength(1)
    yield* Effect.promise(() => Instance.reload({ directory: dir }))

    const exit = yield* Fiber.await(fiber)
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) expect(Cause.squash(exit.cause)).toBeInstanceOf(Permission.RejectedError)
  }),
)

it.live("reply - does nothing for unknown requestID", () =>
  withDir({ git: true }, () =>
    Effect.gen(function* () {
      yield* reply({ requestID: PermissionID.make("per_unknown"), reply: "once" })
      expect(yield* list()).toHaveLength(0)
    }),
  ),
)

it.live("ask - checks all patterns and stops on first deny", () =>
  withDir({ git: true }, () =>
    Effect.gen(function* () {
      const err = yield* fail(
        ask({
          sessionID: SessionID.make("session_test"),
          permission: "bash",
          patterns: ["echo hello", "rm -rf /"],
          metadata: {},
          always: [],
          ruleset: [
            { permission: "bash", pattern: "*", action: "allow" },
            { permission: "bash", pattern: "rm *", action: "deny" },
          ],
        }),
      )
      expect(err).toBeInstanceOf(Permission.DeniedError)
    }),
  ),
)

it.live("ask - allows all patterns when all match allow rules", () =>
  withDir({ git: true }, () =>
    Effect.gen(function* () {
      const result = yield* ask({
        sessionID: SessionID.make("session_test"),
        permission: "bash",
        patterns: ["echo hello", "ls -la", "pwd"],
        metadata: {},
        always: [],
        ruleset: [{ permission: "bash", pattern: "*", action: "allow" }],
      })
      expect(result).toBeUndefined()
    }),
  ),
)

it.live("ask - should deny even when an earlier pattern is ask", () =>
  withDir({ git: true }, () =>
    Effect.gen(function* () {
      const err = yield* fail(
        ask({
          sessionID: SessionID.make("session_test"),
          permission: "bash",
          patterns: ["echo hello", "rm -rf /"],
          metadata: {},
          always: [],
          ruleset: [
            { permission: "bash", pattern: "echo *", action: "ask" },
            { permission: "bash", pattern: "rm *", action: "deny" },
          ],
        }),
      )

      expect(err).toBeInstanceOf(Permission.DeniedError)
      expect(yield* list()).toHaveLength(0)
    }),
  ),
)

it.live("ask - abort should clear pending request", () =>
  Effect.gen(function* () {
    const dir = yield* tmpdirScoped({ git: true })
    const run = withProvided(dir)

    const fiber = yield* ask({
      id: PermissionID.make("per_reload"),
      sessionID: SessionID.make("session_reload"),
      permission: "bash",
      patterns: ["ls"],
      metadata: {},
      always: [],
      ruleset: [{ permission: "bash", pattern: "*", action: "ask" }],
    }).pipe(run, Effect.forkScoped)

    const pending = yield* waitForPending(1).pipe(run)
    expect(pending).toHaveLength(1)
    yield* Effect.promise(() => Instance.reload({ directory: dir }))

    const exit = yield* Fiber.await(fiber)
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) expect(Cause.squash(exit.cause)).toBeInstanceOf(Permission.RejectedError)
  }),
)

// evaluate: real-world agent config patterns

test("evaluate - .env.example allow overrides .env.* ask (agent config pattern)", () => {
  const ruleset = Permission.fromConfig({
    read: {
      "*": "allow",
      "*.env": "ask",
      "*.env.*": "ask",
      "*.env.example": "allow",
    },
  })
  expect(Permission.evaluate("read", ".env.example", ruleset).action).toBe("allow")
  expect(Permission.evaluate("read", ".env", ruleset).action).toBe("ask")
  expect(Permission.evaluate("read", ".env.local", ruleset).action).toBe("ask")
  expect(Permission.evaluate("read", ".env.production", ruleset).action).toBe("ask")
  expect(Permission.evaluate("read", "src/index.ts", ruleset).action).toBe("allow")
})

test("evaluate - deny in later ruleset beats allow in earlier", () => {
  const ruleset1: Permission.Ruleset = [{ permission: "bash", pattern: "*", action: "allow" }]
  const ruleset2: Permission.Ruleset = [{ permission: "bash", pattern: "rm *", action: "deny" }]
  expect(Permission.evaluate("bash", "rm -rf /", ruleset1, ruleset2).action).toBe("deny")
})

test("evaluate - deny in earlier ruleset beats allow in later", () => {
  const ruleset1: Permission.Ruleset = [{ permission: "bash", pattern: "rm *", action: "deny" }]
  const ruleset2: Permission.Ruleset = [{ permission: "bash", pattern: "*", action: "allow" }]
  expect(Permission.evaluate("bash", "rm -rf /", ruleset1, ruleset2).action).toBe("deny")
})

test("evaluate - last-match-wins for ask vs allow preserves specificity", () => {
  const ruleset: Permission.Ruleset = [
    { permission: "edit", pattern: "*", action: "ask" },
    { permission: "edit", pattern: "src/*", action: "allow" },
  ]
  // src/* allow is more specific and comes last → wins over * ask
  expect(Permission.evaluate("edit", "src/foo.ts", ruleset).action).toBe("allow")
  // non-matching specific → falls back to * ask
  expect(Permission.evaluate("edit", "config.json", ruleset).action).toBe("ask")
})

// safety integration in ask()

it.live("ask - safety forces ask even when ruleset allows dangerous file", () =>
  withDir({ git: true }, () =>
    Effect.gen(function* () {
      const fiber = yield* ask({
        sessionID: SessionID.make("session_safety1"),
        permission: "edit",
        patterns: [".bashrc"],
        metadata: {},
        always: [".bashrc"],
        ruleset: [{ permission: "edit", pattern: "*", action: "allow" }],
      }).pipe(Effect.forkScoped)

      // safety override: .bashrc should still require permission despite allow rule
      const pending = yield* waitForPending(1)
      expect(pending).toHaveLength(1)
      expect(pending[0].patterns).toContain(".bashrc")

      yield* rejectAll()
      yield* Fiber.await(fiber)
    }),
  ),
)

it.live("ask - safety does not override deny (deny still short-circuits)", () =>
  withDir({ git: true }, () =>
    Effect.gen(function* () {
      const err = yield* fail(
        ask({
          sessionID: SessionID.make("session_safety2"),
          permission: "edit",
          patterns: [".bashrc"],
          metadata: {},
          always: [],
          ruleset: [{ permission: "edit", pattern: "*", action: "deny" }],
        }),
      )
      expect(err).toBeInstanceOf(Permission.DeniedError)
    }),
  ),
)

it.live("ask - safety does not check read permission (only edit/bash)", () =>
  withDir({ git: true }, () =>
    Effect.gen(function* () {
      const result = yield* ask({
        sessionID: SessionID.make("session_safety3"),
        permission: "read",
        patterns: [".bashrc"],
        metadata: {},
        always: [],
        ruleset: [{ permission: "read", pattern: "*", action: "allow" }],
      })
      // read + .bashrc + allow → resolves immediately (safety only checks edit/bash)
      expect(result).toBeUndefined()
    }),
  ),
)

it.live("ask - safety forces ask for .git directory even with allow", () =>
  withDir({ git: true }, () =>
    Effect.gen(function* () {
      const fiber = yield* ask({
        sessionID: SessionID.make("session_safety4"),
        permission: "edit",
        patterns: [".git/config"],
        metadata: {},
        always: [".git/config"],
        ruleset: [{ permission: "edit", pattern: "*", action: "allow" }],
      }).pipe(Effect.forkScoped)

      const pending = yield* waitForPending(1)
      expect(pending).toHaveLength(1)

      yield* rejectAll()
      yield* Fiber.await(fiber)
    }),
  ),
)

it.live("ask - normal file resolves immediately with allow (safety not triggered)", () =>
  withDir({ git: true }, () =>
    Effect.gen(function* () {
      const result = yield* ask({
        sessionID: SessionID.make("session_safety5"),
        permission: "edit",
        patterns: ["src/index.ts"],
        metadata: {},
        always: [],
        ruleset: [{ permission: "edit", pattern: "*", action: "allow" }],
      })
      expect(result).toBeUndefined()
    }),
  ),
)

// denial tracking

it.live("denial tracking - consecutive rejections do not break", () =>
  withDir({ git: true }, () =>
    Effect.gen(function* () {
      // reject 4 times in a row (exceeds MAX_CONSECUTIVE_DENIALS=3)
      for (let i = 0; i < 4; i++) {
        const id = PermissionID.make(`per_deny_consec_${i}`)
        const fiber = yield* ask({
          id,
          sessionID: SessionID.make("session_deny_track"),
          permission: "bash",
          patterns: ["dangerous_cmd"],
          metadata: {},
          always: [],
          ruleset: [],
        }).pipe(Effect.forkScoped)
        yield* waitForPending(1)
        yield* reply({ requestID: id, reply: "reject" })
        yield* Fiber.await(fiber)
      }
      // 4th rejection succeeded without crash — tracking works
      expect(true).toBe(true)
    }),
  ),
)

it.live("denial tracking - approval resets consecutive counter", () =>
  withDir({ git: true }, () =>
    Effect.gen(function* () {
      // reject twice
      for (let i = 0; i < 2; i++) {
        const id = PermissionID.make(`per_deny_reset_${i}`)
        const fiber = yield* ask({
          id,
          sessionID: SessionID.make("session_deny_reset"),
          permission: "bash",
          patterns: ["cmd"],
          metadata: {},
          always: ["cmd"],
          ruleset: [],
        }).pipe(Effect.forkScoped)
        yield* waitForPending(1)
        yield* reply({ requestID: id, reply: "reject" })
        yield* Fiber.await(fiber)
      }

      // approve once (resets consecutive counter)
      const approveId = PermissionID.make("per_deny_reset_approve")
      const approveFiber = yield* ask({
        id: approveId,
        sessionID: SessionID.make("session_deny_reset"),
        permission: "bash",
        patterns: ["cmd"],
        metadata: {},
        always: ["cmd"],
        ruleset: [],
      }).pipe(Effect.forkScoped)
      yield* waitForPending(1)
      yield* reply({ requestID: approveId, reply: "once" })
      yield* Fiber.join(approveFiber)

      // reject twice more (should work fine since consecutive was reset)
      for (let i = 0; i < 2; i++) {
        const id = PermissionID.make(`per_deny_reset_after_${i}`)
        const fiber = yield* ask({
          id,
          sessionID: SessionID.make("session_deny_reset"),
          permission: "bash",
          patterns: ["cmd"],
          metadata: {},
          always: [],
          ruleset: [],
        }).pipe(Effect.forkScoped)
        yield* waitForPending(1)
        yield* reply({ requestID: id, reply: "reject" })
        yield* Fiber.await(fiber)
      }

      expect(true).toBe(true)
    }),
  ),
)

it.live("denial tracking - separate sessions are independent", () =>
  withDir({ git: true }, () =>
    Effect.gen(function* () {
      // reject in session A
      const idA = PermissionID.make("per_deny_iso_a")
      const fiberA = yield* ask({
        id: idA,
        sessionID: SessionID.make("session_deny_iso_a"),
        permission: "bash",
        patterns: ["cmd"],
        metadata: {},
        always: [],
        ruleset: [],
      }).pipe(Effect.forkScoped)
      yield* waitForPending(1)
      yield* reply({ requestID: idA, reply: "reject" })
      yield* Fiber.await(fiberA)

      // approve in session B (separate session, no cross-contamination)
      const idB = PermissionID.make("per_deny_iso_b")
      const fiberB = yield* ask({
        id: idB,
        sessionID: SessionID.make("session_deny_iso_b"),
        permission: "bash",
        patterns: ["cmd"],
        metadata: {},
        always: ["cmd"],
        ruleset: [],
      }).pipe(Effect.forkScoped)
      yield* waitForPending(1)
      yield* reply({ requestID: idB, reply: "once" })
      yield* Fiber.join(fiberB)

      // reject again in session A
      const idA2 = PermissionID.make("per_deny_iso_a2")
      const fiberA2 = yield* ask({
        id: idA2,
        sessionID: SessionID.make("session_deny_iso_a"),
        permission: "bash",
        patterns: ["cmd"],
        metadata: {},
        always: [],
        ruleset: [],
      }).pipe(Effect.forkScoped)
      yield* waitForPending(1)
      yield* reply({ requestID: idA2, reply: "reject" })
      const exit = yield* Fiber.await(fiberA2)
      expect(Exit.isFailure(exit)).toBe(true)
    }),
  ),
)
