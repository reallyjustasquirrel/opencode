import { test, expect } from "bun:test"
import { Safety } from "../../src/permission/safety"

// dangerous files

test("check - .bashrc always asks for edit", () => {
  expect(Safety.check("edit", ".bashrc")).toBe("ask")
})

test("check - .gitconfig always asks for edit", () => {
  expect(Safety.check("edit", ".gitconfig")).toBe("ask")
})

test("check - .zshrc always asks for edit", () => {
  expect(Safety.check("edit", ".zshrc")).toBe("ask")
})

test("check - .npmrc always asks for edit", () => {
  expect(Safety.check("edit", ".npmrc")).toBe("ask")
})

test("check - .netrc always asks for edit", () => {
  expect(Safety.check("edit", ".netrc")).toBe("ask")
})

test("check - .profile always asks for edit", () => {
  expect(Safety.check("edit", ".profile")).toBe("ask")
})

test("check - .pypirc always asks for edit", () => {
  expect(Safety.check("edit", ".pypirc")).toBe("ask")
})

test("check - nested dangerous file still triggers", () => {
  expect(Safety.check("edit", "home/user/.bashrc")).toBe("ask")
})

// dangerous directories

test("check - .git directory always asks for edit", () => {
  expect(Safety.check("edit", ".git/config")).toBe("ask")
})

test("check - .vscode directory always asks for edit", () => {
  expect(Safety.check("edit", ".vscode/settings.json")).toBe("ask")
})

test("check - .idea directory always asks for edit", () => {
  expect(Safety.check("edit", ".idea/workspace.xml")).toBe("ask")
})

test("check - .opencode directory always asks for edit", () => {
  expect(Safety.check("edit", ".opencode/config.json")).toBe("ask")
})

test("check - nested .git directory triggers", () => {
  expect(Safety.check("edit", "submodule/.git/HEAD")).toBe("ask")
})

// bash permission also checked

test("check - .git triggers for bash permission", () => {
  expect(Safety.check("bash", ".git/config")).toBe("ask")
})

test("check - .bashrc triggers for bash permission", () => {
  expect(Safety.check("bash", ".bashrc")).toBe("ask")
})

// safe patterns pass through

test("check - normal file returns null", () => {
  expect(Safety.check("edit", "src/index.ts")).toBeNull()
})

test("check - normal directory returns null", () => {
  expect(Safety.check("edit", "src/components/Button.tsx")).toBeNull()
})

test("check - read permission not checked", () => {
  expect(Safety.check("read", ".bashrc")).toBeNull()
})

test("check - glob permission not checked", () => {
  expect(Safety.check("glob", ".git/config")).toBeNull()
})

// case insensitive on macOS/Windows

test("check - case insensitive on darwin/win32", () => {
  if (process.platform === "darwin" || process.platform === "win32") {
    expect(Safety.check("edit", ".Git/config")).toBe("ask")
    expect(Safety.check("edit", ".BASHRC")).toBe("ask")
    expect(Safety.check("edit", ".VSCode/settings.json")).toBe("ask")
  }
})
