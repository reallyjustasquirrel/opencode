# OpenCode — Hardened Fork

> **This is not the official OpenCode.** This is a security-hardened fork of [anomalyco/opencode](https://github.com/anomalyco/opencode) maintained for internal use. It adds a permission safety floor, dangerous command detection, shell obfuscation detection, and denial tracking on top of upstream OpenCode. The `hardened` branch is rebased on upstream `dev` nightly.

---

## What's Different

| Feature | Upstream | This Fork |
|---|---|---|
| Deny-always-wins evaluation | No (last-match-wins only) | Yes |
| Hardcoded dangerous files (.bashrc, .gitconfig, etc.) | No | 11 files, 4 directories |
| Destructive command detection (rm -rf, chmod -R, mkfs, dd) | No | Yes |
| Shell obfuscation detection (IFS injection, unicode, etc.) | No | 7 patterns |
| Dangerous interpreter detection (python -c, curl\|bash) | No | 8 patterns |
| Tool filtering for wildcard-denied tools | No | Yes |
| Denial tracking with thresholds | No | 3 consecutive / 20 total |
| Case-insensitive matching on macOS | Partial | Full |

See [the detailed comparison](#how-the-hardening-works) below.

---

## Installation

### Option 1: Build from Source (Recommended)

Requires **Bun 1.3+** (`curl -fsSL https://bun.sh/install | bash`)

```bash
git clone https://github.com/reallyjustasquirrel/opencode.git
cd opencode
bun install

# Run directly (no build needed)
bun dev

# Or build a standalone binary
./packages/opencode/script/build.ts --single
# Binary at: packages/opencode/dist/opencode-<platform>/bin/opencode
```

**macOS code signing workaround:** If the compiled binary exits with code 137, use a wrapper script:

```bash
cat > /usr/local/bin/opencode-hardened << 'EOF'
#!/bin/bash
exec bun run --cwd /path/to/opencode/packages/opencode ./src/index.ts "$@"
EOF
chmod +x /usr/local/bin/opencode-hardened
```

### Option 2: Download from Releases

Download the latest build from [Releases](https://github.com/reallyjustasquirrel/opencode/releases). Nightlies are published automatically.

### Option 3: VS Code Extension

```bash
cd sdks/vscode && bun install && bun run package && npx @vscode/vsce package --no-dependencies
code --install-extension sdks/vscode/opencode-*.vsix
```

---

## Configuring Permissions

Permissions are configured in `opencode.json` (project root or `~/.opencode/`) or per-agent in `.opencode/agents/*.md`.

### Quick Start

```json
{
  "permission": {
    "edit": {
      "*": "allow",
      "*.env": "ask",
      "*.env.*": "ask",
      "*.env.example": "allow"
    },
    "bash": {
      "*": "allow",
      "rm *": "ask",
      "sudo *": "deny"
    },
    "external_directory": {
      "*": "ask",
      "~/projects/*": "allow"
    }
  }
}
```

### Permission Types

| Type | Default | Description |
|---|---|---|
| `read` | allow (ask for .env) | File reads |
| `edit` | allow | File modifications |
| `bash` | allow | Shell commands |
| `glob` | allow | Pattern globbing |
| `grep` | allow | Code search |
| `list` | allow | Directory listing |
| `task` | allow | Subagent tasks |
| `external_directory` | ask | Access outside project root |
| `webfetch` | allow | URL fetching |
| `websearch` | allow | Web search |
| `question` | deny | Answer user questions |

### Actions

- **`allow`** — execute without prompting
- **`ask`** — prompt the user each time
- **`deny`** — block the action silently

### Rule Evaluation

Rules are evaluated in two stages:

**Stage 1: Safety floor (hardcoded, cannot be overridden)**

The hardening layer forces an "ask" prompt for:
- **Dangerous files:** `.gitconfig`, `.gitmodules`, `.bashrc`, `.bash_profile`, `.zshrc`, `.zprofile`, `.profile`, `.npmrc`, `.pypirc`, `.netrc`, `.ripgreprc`
- **Dangerous directories:** `.git/`, `.vscode/`, `.idea/`, `.opencode/`
- **Destructive commands:** `rm -rf`, `chmod -R /`, `mkfs`, `dd if=`, fork bombs, `/etc/passwd` writes
- **Shell obfuscation:** `$IFS` injection, control characters, unicode whitespace, `jq` system calls, `/proc/*/environ`, ANSI-C hex escapes, heredoc-in-substitution
- **Dangerous interpreters:** `python -c`, `node -e`, `ruby -e`, `curl | bash`, `eval`, `ssh` remote commands, `npx`/`bunx`
- **zsh builtins:** `zmodload`, `zpty`, `ztcp`, `zsocket`, `zf_*`

Even if your config says `"allow"`, these will prompt. You cannot bypass the safety floor — this is intentional.

**Stage 2: Your rules**

1. Deny always wins — if any matching rule is `deny`, the action is denied regardless of other rules
2. For `ask` vs `allow` — last-match-wins, so more specific rules override general ones

This means you can write:
```json
{
  "edit": {
    "*.env.*": "ask",
    "*.env.example": "allow"
  }
}
```
And `.env.example` files will be allowed while `.env.local` will prompt.

### Agent-Level Permissions

Override permissions for specific agents in `opencode.json`:

```json
{
  "agent": {
    "build": {
      "permission": {
        "bash": { "*": "allow" },
        "edit": { "*": "allow", "*.env": "ask" }
      }
    },
    "plan": {
      "permission": {
        "bash": { "*": "ask" },
        "edit": { "*": "deny" }
      }
    }
  }
}
```

Or in a markdown agent file (`.opencode/agents/secure.md`):

```markdown
---
name: secure
model: claude-sonnet-4-20250514
permission:
  bash:
    "*": deny
  edit:
    "src/*": allow
    "*": deny
  read: allow
  grep: allow
---

# Secure Agent
Read-only agent that can only edit files under src/.
```

### Denial Tracking

The hardening tracks consecutive and total denials per session:
- **3 consecutive denials** — logs a warning (the model may be stuck)
- **20 total denials** — logs a warning (the model may be in a loop)
- Approving a request resets the consecutive counter

This is informational only — it doesn't block the model.

### Pattern Syntax

- `*` — matches anything
- `*.env` — match by extension
- `src/*` — match within a directory
- `~/projects/*` — tilde expands to home directory
- `$HOME/work/*` — `$HOME` expansion
- Bash permission patterns match against the command string: `"rm -rf *": "deny"`

On macOS, all pattern matching is case-insensitive.

---

## How the Hardening Works

### Architecture

```
Permission request arrives
  │
  ├── Stage 1: Safety.check()
  │   └── Hardcoded dangerous files/dirs → force "ask"
  │
  ├── Stage 1b: DangerousCommands.check() (bash only)
  │   └── Destructive/obfuscation/interpreter patterns → force "ask"
  │
  ├── Stage 2: evaluate() with user rules
  │   ├── findLast deny → DENY (deny always wins)
  │   └── findLast ask/allow → last-match-wins
  │
  └── Stage 3: Tool filtering
      └── Wildcard-denied tools removed from LLM context
```

### Files Changed from Upstream

| File | Purpose |
|---|---|
| `packages/opencode/src/permission/safety.ts` | Hardcoded dangerous file/directory list |
| `packages/opencode/src/permission/dangerous-commands.ts` | Destructive, obfuscation, interpreter, zsh patterns |
| `packages/opencode/src/permission/evaluate.ts` | Deny-always-wins evaluation logic |
| `packages/opencode/src/permission/index.ts` | Safety integration, denial tracking |
| `packages/opencode/src/tool/registry.ts` | Tool filtering for denied tools |
| `packages/opencode/src/tool/bash.ts` | Dangerous command check before execution |
| `packages/opencode/src/util/wildcard.ts` | Case-insensitive matching on macOS |

### Tests

203 permission tests across 4 test files. Run with:

```bash
cd packages/opencode && bun test test/permission/
```

---

## Staying Updated

The `hardened` branch is rebased onto upstream `dev` nightly via GitHub Actions. To update locally:

```bash
git fetch origin
git checkout hardened
git reset --hard origin/hardened
bun install
```

To check what's different from upstream:

```bash
git log --oneline dev..hardened
```

---

## Upstream

This fork tracks [anomalyco/opencode](https://github.com/anomalyco/opencode). For general OpenCode documentation, see [opencode.ai/docs](https://opencode.ai/docs). For contributing to upstream, see their [CONTRIBUTING.md](https://github.com/anomalyco/opencode/blob/dev/CONTRIBUTING.md).

> **Disclaimer:** This fork is not built by, maintained by, or affiliated with the OpenCode team.
