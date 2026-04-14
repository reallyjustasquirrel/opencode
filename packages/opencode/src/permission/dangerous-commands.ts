// Detect obviously destructive bash commands that should always require approval
// regardless of permission configuration.

const PATTERNS = [
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

export function check(command: string): { dangerous: boolean; reason: string } | null {
  const trimmed = command.trim()
  for (const pattern of PATTERNS) {
    if (pattern.test(trimmed)) return { dangerous: true, reason: `Command matches destructive pattern: ${pattern}` }
  }
  return null
}

export const DangerousCommands = { check }
