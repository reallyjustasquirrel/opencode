// Detect obviously destructive or obfuscated bash commands that should always
// require approval regardless of permission configuration.

// --- destructive command patterns ---

const DESTRUCTIVE = [
  // recursive removal of root or home
  /\brm\b.*-[^\s]*r[^\s]*f.*\s+\/\s*$/,
  /\brm\b.*-[^\s]*r[^\s]*f\s+\/$/,
  /\brm\b.*-[^\s]*r[^\s]*f\s+~\/?$/,
  /\brm\b.*-[^\s]*r[^\s]*f\s+\$HOME\/?$/,
  /\brm\b.*-[^\s]*r[^\s]*f\s+\$\{?HOME\}?\/?$/,
  /\brm\b.*-[^\s]*r[^\s]*\s+\/\s*$/,
  // chmod/chown -R on root
  /\bchmod\b.*-[^\s]*R[^\s]*\s+\d+\s+\/\s*$/,
  /\bchown\b.*-[^\s]*R[^\s]*\s+\S+\s+\/\s*$/,
  // disk/partition destruction
  /\bmkfs\b/,
  /\bdd\b.*\bof\s*=\s*\/dev\/[sh]d/,
  />\s*\/dev\/[sh]d/,
  // fork bomb
  /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;?\s*:/,
  // wipe commands
  /\bshred\b.*\/dev\/[sh]d/,
  /\bwipefs\b/,
  // overwrite critical system files
  />\s*\/etc\/passwd/,
  />\s*\/etc\/shadow/,
]

// --- obfuscation / injection patterns ---

const OBFUSCATION = [
  // IFS injection (word splitting bypass)
  { pattern: /\$IFS|\$\{[^}]*IFS/, reason: "IFS variable injection" },
  // control characters (non-printable bytes that may confuse parsers)
  { pattern: /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/, reason: "non-printable control character" },
  // unicode whitespace (shell-quote misparsing)
  { pattern: /[\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]/, reason: "unicode whitespace character" },
  // jq system() (arbitrary code execution via jq)
  { pattern: /\bjq\b.*\bsystem\s*\(/, reason: "jq system() call" },
  // /proc environ access (secret theft)
  { pattern: /\/proc\/.*\/environ/, reason: "/proc environ access" },
  // ANSI-C quoting (can hide bytes)
  { pattern: /\$'[^']*\\x[0-9a-fA-F]/, reason: "ANSI-C hex escape in quoting" },
  // heredoc inside command substitution
  { pattern: /\$\(.*<</, reason: "heredoc inside command substitution" },
]

// --- dangerous interpreter patterns ---
// These run arbitrary code and bypass file-level permission checks.

const INTERPRETERS = [
  { pattern: /(?:^|[;&|]\s*)(?:python[23]?|python3\.\d+)\s+-[cmu]\s/, reason: "python inline code execution" },
  { pattern: /(?:^|[;&|]\s*)(?:node|deno|tsx|bun)\s+-?e\s/, reason: "javascript runtime inline execution" },
  { pattern: /(?:^|[;&|]\s*)(?:ruby|perl|php|lua)\s+-e\s/, reason: "scripting language inline execution" },
  { pattern: /(?:^|[;&|]\s*)(?:bash|sh|zsh|fish)\s+-c\s/, reason: "shell inline code execution" },
  { pattern: /(?:^|[;&|]\s*)(?:ssh)\s+.*\s+['"]/, reason: "ssh remote command execution" },
  { pattern: /(?:^|[;&|]\s*)(?:npx|bunx)\s/, reason: "package runner (downloads and executes code)" },
  { pattern: /(?:^|[;&|]\s*)(?:eval|exec)\s/, reason: "eval/exec command" },
  { pattern: /(?:^|[;&|]\s*)(?:curl|wget)\s.*\|\s*(?:bash|sh|zsh)/, reason: "pipe remote script to shell" },
]

// --- zsh dangerous builtins ---

const ZSH_BUILTINS = /(?:^|[;&|]\s*)(?:zmodload|zpty|ztcp|zsocket|zf_rm|zf_mv|zf_ln|zf_chmod|zf_chown|zf_mkdir|zf_rmdir)\b/

export function check(command: string): { dangerous: boolean; reason: string } | null {
  const trimmed = command.trim()

  for (const pattern of DESTRUCTIVE) {
    if (pattern.test(trimmed)) return { dangerous: true, reason: `Destructive pattern: ${pattern}` }
  }

  for (const entry of OBFUSCATION) {
    if (entry.pattern.test(trimmed)) return { dangerous: true, reason: entry.reason }
  }

  for (const entry of INTERPRETERS) {
    if (entry.pattern.test(trimmed)) return { dangerous: true, reason: entry.reason }
  }

  if (ZSH_BUILTINS.test(trimmed)) return { dangerous: true, reason: "zsh dangerous builtin" }

  return null
}

export const DangerousCommands = { check }
