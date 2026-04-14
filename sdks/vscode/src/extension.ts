// This method is called when your extension is deactivated
export function deactivate() {}

import * as vscode from "vscode"
import * as path from "path"
import * as os from "os"
import * as fs from "fs"

const TERMINAL_NAME = "opencode"

const DEFAULT_CONFIG = `{
  "$schema": "https://opencode.ai/config.json",

  // ═══════════════════════════════════════════════════════════════════════
  // HARDCODED SAFETY FLOOR (built into the binary — cannot be overridden)
  // ═══════════════════════════════════════════════════════════════════════
  //
  // The following protections are enforced at the binary level and always
  // require approval regardless of what you configure here:
  //
  // DANGEROUS FILES (edits always prompt):
  //   .gitconfig, .gitmodules, .bashrc, .bash_profile, .zshrc, .zprofile,
  //   .profile, .npmrc, .pypirc, .netrc, .ripgreprc
  //
  // DANGEROUS DIRECTORIES (edits always prompt):
  //   .git/, .vscode/, .idea/, .opencode/
  //
  // DESTRUCTIVE COMMANDS (always prompt):
  //   rm -rf /  |  rm -rf ~  |  chmod -R on /  |  chown -R on /
  //   mkfs, dd of=/dev/*, shred, wipefs, fork bombs
  //   overwriting /etc/passwd or /etc/shadow
  //
  // OBFUSCATION DETECTION (always prompt):
  //   $IFS injection, non-printable control chars, unicode whitespace,
  //   jq system() calls, /proc/*/environ access, ANSI-C hex escapes,
  //   heredocs inside command substitution
  //
  // DANGEROUS INTERPRETERS (always prompt):
  //   python -c, node -e, ruby -e, perl -e, bash -c, ssh remote exec,
  //   npx/bunx, eval/exec, curl|bash
  //
  // DANGEROUS ZSH BUILTINS (always prompt):
  //   zmodload, zpty, ztcp, zsocket, zf_rm, zf_mv, zf_ln, etc.
  //
  // DENIAL TRACKING:
  //   3 consecutive denials or 20 total denials in a session → tool
  //   is disabled for the remainder of the session.
  //
  // None of the above can be set to "allow" via config. Setting "allow"
  // on a pattern that matches these will still trigger the safety floor.
  //
  // ═══════════════════════════════════════════════════════════════════════
  // YOUR RULES (edit these to match your workflow)
  // ═══════════════════════════════════════════════════════════════════════
  //
  // Values: "allow" (no prompt), "ask" (confirm each time), "deny" (block)
  // Patterns: glob-style — * matches anything, ? matches one char
  // Precedence: deny always wins. Otherwise, last matching rule wins.

  "permission": {

    // -- file editing rules --
    // Which files the agent can create or modify.
    "edit": {
      // Protect your credentials and dotfiles beyond the safety floor
      // "~/.ssh/*": "deny",
      // "~/.aws/*": "deny",
      // "~/.gnupg/*": "deny",
      // "~/.env": "ask",

      // Lock down files you don't want AI touching
      // "*.lock": "deny",
      // "package-lock.json": "deny",
      // "migration/*": "deny"
    },

    // -- shell command rules --
    // Which bash commands the agent can run.
    "bash": {
      // Common safe commands you might want to auto-approve:
      // "ls *": "allow",
      // "cat *": "allow",
      // "grep *": "allow",
      // "find *": "allow",
      // "git diff *": "allow",
      // "git log *": "allow",
      // "git status": "allow",

      // Block patterns you never want
      // "curl * | sh": "deny",
      // "curl * | bash": "deny",
      // "wget * | sh": "deny",

      // Default: prompt for everything else
      // "*": "ask"
    },

    // -- file reading rules --
    "read": {
      // "~/.ssh/*": "deny",
      // "~/.aws/*": "deny"
    },

    // -- web access --
    // "webfetch": "ask",
    // "websearch": "ask",

    // -- MCP tools --
    // "mcp": "ask"
  }

  // -- provider (uncomment and set your preferred LLM) --
  // "provider": {
  //   "anthropic": {
  //     "model": "claude-sonnet-4-20250514"
  //   }
  // }

  // -- MCP servers --
  // "mcp": {}

  // -- disabled tools --
  // "tools": {
  //   "some-tool-name": false
  // }
}
`

function ensureDefaultConfig() {
  const configDir = path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "opencode")
  const configFile = path.join(configDir, "opencode.jsonc")

  if (fs.existsSync(configFile)) return

  try {
    fs.mkdirSync(configDir, { recursive: true })
    fs.writeFileSync(configFile, DEFAULT_CONFIG, { flag: "wx" })
  } catch (_) {
    // File was created between check and write, or permission issue — ignore
  }
}

export function activate(context: vscode.ExtensionContext) {
  ensureDefaultConfig()
  let openNewTerminalDisposable = vscode.commands.registerCommand("opencode.openNewTerminal", async () => {
    await openTerminal()
  })

  let openTerminalDisposable = vscode.commands.registerCommand("opencode.openTerminal", async () => {
    // An opencode terminal already exists => focus it
    const existingTerminal = vscode.window.terminals.find((t) => t.name === TERMINAL_NAME)
    if (existingTerminal) {
      existingTerminal.show()
      return
    }

    await openTerminal()
  })

  let addFilepathDisposable = vscode.commands.registerCommand("opencode.addFilepathToTerminal", async () => {
    const fileRef = getActiveFile()
    if (!fileRef) {
      return
    }

    const terminal = vscode.window.activeTerminal
    if (!terminal) {
      return
    }

    if (terminal.name === TERMINAL_NAME) {
      // @ts-ignore
      const port = terminal.creationOptions.env?.["_EXTENSION_OPENCODE_PORT"]
      port ? await appendPrompt(parseInt(port), fileRef) : terminal.sendText(fileRef, false)
      terminal.show()
    }
  })

  context.subscriptions.push(openTerminalDisposable, addFilepathDisposable)

  async function openTerminal() {
    // Create a new terminal in split screen
    const port = Math.floor(Math.random() * (65535 - 16384 + 1)) + 16384
    const terminal = vscode.window.createTerminal({
      name: TERMINAL_NAME,
      iconPath: {
        light: vscode.Uri.file(context.asAbsolutePath("images/button-dark.svg")),
        dark: vscode.Uri.file(context.asAbsolutePath("images/button-light.svg")),
      },
      location: {
        viewColumn: vscode.ViewColumn.Beside,
        preserveFocus: false,
      },
      env: {
        _EXTENSION_OPENCODE_PORT: port.toString(),
        OPENCODE_CALLER: "vscode",
      },
    })

    terminal.show()
    terminal.sendText(`opencode --port ${port}`)

    const fileRef = getActiveFile()
    if (!fileRef) {
      return
    }

    // Wait for the terminal to be ready
    let tries = 10
    let connected = false
    do {
      await new Promise((resolve) => setTimeout(resolve, 200))
      try {
        await fetch(`http://localhost:${port}/app`)
        connected = true
        break
      } catch (e) {}

      tries--
    } while (tries > 0)

    // If connected, append the prompt to the terminal
    if (connected) {
      await appendPrompt(port, `In ${fileRef}`)
      terminal.show()
    }
  }

  async function appendPrompt(port: number, text: string) {
    await fetch(`http://localhost:${port}/tui/append-prompt`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    })
  }

  function getActiveFile() {
    const activeEditor = vscode.window.activeTextEditor
    if (!activeEditor) {
      return
    }

    const document = activeEditor.document
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri)
    if (!workspaceFolder) {
      return
    }

    // Get the relative path from workspace root
    const relativePath = vscode.workspace.asRelativePath(document.uri)
    let filepathWithAt = `@${relativePath}`

    // Check if there's a selection and add line numbers
    const selection = activeEditor.selection
    if (!selection.isEmpty) {
      // Convert to 1-based line numbers
      const startLine = selection.start.line + 1
      const endLine = selection.end.line + 1

      if (startLine === endLine) {
        // Single line selection
        filepathWithAt += `#L${startLine}`
      } else {
        // Multi-line selection
        filepathWithAt += `#L${startLine}-${endLine}`
      }
    }

    return filepathWithAt
  }
}
