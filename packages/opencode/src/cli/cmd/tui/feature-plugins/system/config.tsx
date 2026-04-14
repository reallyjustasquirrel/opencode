import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from "@opencode-ai/plugin/tui"
import { Global } from "@/global"
import { Filesystem } from "@/util/filesystem"
import { Process } from "@/util/process"
import { spawn as nodeSpawn } from "child_process"
import path from "path"

const id = "internal:config"

async function configPath(): Promise<string> {
  const dir = Global.Path.config
  for (const name of ["opencode.jsonc", "opencode.json", "config.json"]) {
    const file = path.join(dir, name)
    if (await Filesystem.exists(file)) return file
  }
  return path.join(dir, "opencode.jsonc")
}

function isTerminalEditor(cmd: string): boolean {
  const terminal = ["vi", "vim", "nvim", "nano", "emacs", "micro", "helix", "hx", "joe", "pico", "ne"]
  const bin = cmd.split("/").pop()?.split(" ")[0] || ""
  return terminal.includes(bin)
}

async function openConfig(api: TuiPluginApi) {
  const file = await configPath()
  const editor = process.env["VISUAL"] || process.env["EDITOR"]

  // Terminal editors (vim, nano, etc.) need suspend/resume
  if (editor && isTerminalEditor(editor)) {
    const renderer = api.renderer
    renderer.suspend()
    renderer.currentRenderBuffer.clear()
    try {
      const parts = editor.split(" ")
      const proc = Process.spawn([...parts, file], {
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
      })
      await proc.exited
    } finally {
      renderer.currentRenderBuffer.clear()
      renderer.resume()
      renderer.requestRender()
    }
    api.ui.toast({ variant: "info", message: "Config saved — restart opencode to apply changes" })
    return
  }

  // GUI editors — open without blocking the TUI
  if (editor) {
    nodeSpawn(editor.split(" ")[0], [...editor.split(" ").slice(1), file], { detached: true, stdio: "ignore", env: process.env }).unref()
  } else if (process.platform === "darwin") {
    if (process.env["TERM_PROGRAM"] === "vscode") {
      const cli = "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"
      nodeSpawn(cli, ["-r", file], { detached: true, stdio: "ignore", env: process.env }).unref()
    } else {
      nodeSpawn("open", ["-a", "TextEdit", file], { detached: true, stdio: "ignore" }).unref()
    }
  } else if (process.platform === "win32") {
    nodeSpawn("notepad", [file], { detached: true, stdio: "ignore" }).unref()
  } else {
    nodeSpawn("xdg-open", [file], { detached: true, stdio: "ignore" }).unref()
  }
  api.ui.toast({ variant: "info", message: `Opened ${file} — restart opencode after saving` })
}

const tui: TuiPlugin = async (api) => {
  api.command.register(() => [
    {
      title: "Open config",
      value: "config.open",
      category: "System",
      onSelect() {
        openConfig(api)
      },
    },
  ])
}

const plugin: TuiPluginModule & { id: string } = {
  id,
  tui,
}

export default plugin
