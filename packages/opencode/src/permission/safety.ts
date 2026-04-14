import path from "path"

// Files that can be used for code execution, credential theft, or data exfiltration.
// A safety check for these runs BEFORE user-configurable allow rules and cannot be overridden.
const DANGEROUS_FILES = new Set([
  ".gitconfig",
  ".gitmodules",
  ".bashrc",
  ".bash_profile",
  ".zshrc",
  ".zprofile",
  ".profile",
  ".npmrc",
  ".pypirc",
  ".netrc",
  ".ripgreprc",
])

// Directories containing sensitive configuration or executable files.
const DANGEROUS_DIRECTORIES = new Set([".git", ".vscode", ".idea", ".opencode"])

function normalize(filepath: string): string {
  if (process.platform === "win32" || process.platform === "darwin") return filepath.toLowerCase()
  return filepath
}

function segments(filepath: string): string[] {
  return filepath.replace(/\\/g, "/").split("/").filter(Boolean)
}

export function check(permission: string, pattern: string): "ask" | null {
  if (permission !== "edit" && permission !== "bash") return null

  const parts = segments(normalize(pattern))
  for (const seg of parts) {
    if (DANGEROUS_DIRECTORIES.has(seg)) return "ask"
  }
  const base = parts.at(-1)
  if (base && DANGEROUS_FILES.has(base)) return "ask"
  return null
}

export const Safety = { check, DANGEROUS_FILES, DANGEROUS_DIRECTORIES }
