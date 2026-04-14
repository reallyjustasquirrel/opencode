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

// missing dangerous files

test("check - .gitmodules always asks for edit", () => {
  expect(Safety.check("edit", ".gitmodules")).toBe("ask")
})

test("check - .bash_profile always asks for edit", () => {
  expect(Safety.check("edit", ".bash_profile")).toBe("ask")
})

test("check - .zprofile always asks for edit", () => {
  expect(Safety.check("edit", ".zprofile")).toBe("ask")
})

test("check - .ripgreprc always asks for edit", () => {
  expect(Safety.check("edit", ".ripgreprc")).toBe("ask")
})

// bare directory name (no child path)

test("check - bare .git triggers", () => {
  expect(Safety.check("edit", ".git")).toBe("ask")
})

test("check - bare .opencode triggers", () => {
  expect(Safety.check("edit", ".opencode")).toBe("ask")
})

// deeply nested paths

test("check - deeply nested .git triggers", () => {
  expect(Safety.check("edit", "a/b/c/.git/hooks/pre-commit")).toBe("ask")
})

test("check - deeply nested .bashrc triggers", () => {
  expect(Safety.check("bash", "/home/user/dotfiles/.bashrc")).toBe("ask")
})

// every dangerous file is covered

test("check - all dangerous files trigger on edit", () => {
  for (const file of Safety.DANGEROUS_FILES) {
    expect(Safety.check("edit", file)).toBe("ask")
  }
})

// every dangerous directory is covered

test("check - all dangerous directories trigger on edit", () => {
  for (const dir of Safety.DANGEROUS_DIRECTORIES) {
    expect(Safety.check("edit", `${dir}/anything`)).toBe("ask")
  }
})

// boundary: files that look dangerous but aren't

test("check - .gitconfig.bak is NOT dangerous (suffix changes basename)", () => {
  expect(Safety.check("edit", ".gitconfig.bak")).toBeNull()
})

test("check - bashrc without dot is NOT dangerous", () => {
  expect(Safety.check("edit", "bashrc")).toBeNull()
})

test("check - .git-hooks is NOT a dangerous directory", () => {
  expect(Safety.check("edit", ".git-hooks/pre-commit")).toBeNull()
})

test("check - gitconfig (no dot) is NOT dangerous", () => {
  expect(Safety.check("edit", "gitconfig")).toBeNull()
})

// backslash paths

test("check - backslash path .git\\config triggers", () => {
  expect(Safety.check("edit", ".git\\config")).toBe("ask")
})

test("check - backslash nested path triggers", () => {
  expect(Safety.check("edit", "src\\.vscode\\settings.json")).toBe("ask")
})
