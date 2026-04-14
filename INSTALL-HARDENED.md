# Installing OpenCode (Hardened Fork)

This fork adds permission safety hardening on top of upstream OpenCode. It includes deny-always-wins semantics, dangerous file/directory protection, shell obfuscation detection, dangerous command detection, and denial tracking.

**Source:** https://github.com/reallyjustasquirrel/opencode
**Branch:** `feat/permission-safety-hardening`
**Tag:** `v0.1.0-hardened`

---

## Option 1: Build from Source (Recommended)

### Prerequisites

- **Bun 1.3+** — Install with `curl -fsSL https://bun.sh/install | bash`
- **Git**
- macOS (ARM64 or Intel) or Linux

### Steps

```bash
# 1. Clone the fork
git clone https://github.com/reallyjustasquirrel/opencode.git
cd opencode
git checkout feat/permission-safety-hardening

# 2. Install dependencies
bun install

# 3. Build the standalone binary
./packages/opencode/script/build.ts --single

# 4. The binary is at:
#    packages/opencode/dist/opencode-<platform>/bin/opencode
#    e.g. packages/opencode/dist/opencode-darwin-arm64/bin/opencode
```

### Install the Binary

```bash
# Copy to a directory on your PATH
sudo cp packages/opencode/dist/opencode-darwin-arm64/bin/opencode /usr/local/bin/opencode-hardened
```

#### macOS Code Signing Workaround

On macOS, Bun-compiled binaries may fail with exit code 137 due to code signing. If this happens, create a wrapper script instead:

```bash
cat > /usr/local/bin/opencode-hardened << 'EOF'
#!/bin/bash
exec bun run --cwd /path/to/your/opencode/clone/packages/opencode ./src/index.ts "$@"
EOF
chmod +x /usr/local/bin/opencode-hardened
```

Replace `/path/to/your/opencode/clone` with the actual path to your cloned repo.

### Verify

```bash
opencode-hardened --version
```

---

## Option 2: Run Directly with Bun (No Build)

If you don't need a standalone binary, you can run directly from source:

```bash
# Clone and install (one-time)
git clone https://github.com/reallyjustasquirrel/opencode.git
cd opencode
git checkout feat/permission-safety-hardening
bun install

# Run (from the repo root)
bun dev

# Run against a specific directory
bun dev /path/to/your/project
```

Add an alias to your shell profile for convenience:

```bash
# Add to ~/.zshrc or ~/.bashrc
alias oc='bun run --cwd /path/to/opencode dev'
```

---

## Option 3: VS Code Extension (Sideload)

The VS Code extension provides OpenCode integration inside VS Code.

### Build the Extension

```bash
cd opencode   # repo root
cd sdks/vscode

# Install dependencies
bun install

# Compile
bun run package

# Package the .vsix
npx @vscode/vsce package --no-dependencies
```

This produces `sdks/vscode/opencode-1.4.3.vsix`.

### Install the Extension

```bash
code --install-extension sdks/vscode/opencode-1.4.3.vsix
```

Or in VS Code: **Extensions** → **⋯** (menu) → **Install from VSIX…** → select the `.vsix` file.

> **Note:** The sideloaded extension has the same ID (`opencode`) as the marketplace version. If you have the official extension installed, the sideloaded one will replace it. To revert, uninstall and reinstall from the marketplace.

### Extension Requirements

The VS Code extension needs the `opencode` binary on your PATH. Make sure you've completed Option 1 or Option 2 above first.

---

## Staying Updated

To pull the latest changes from this fork:

```bash
cd opencode
git pull origin feat/permission-safety-hardening
bun install   # in case dependencies changed
```

To also sync with upstream OpenCode:

```bash
git remote add upstream https://github.com/anomalyco/opencode.git  # one-time
git fetch upstream
git rebase upstream/dev
```

If there are conflicts, resolve them and `git rebase --continue`.

---

## What's Different from Upstream

| Feature | Upstream | This Fork |
|---|---|---|
| Deny-always-wins evaluation | No (last-match-wins only) | Yes |
| Hardcoded dangerous files (.bashrc, .gitconfig, etc.) | No | Yes (11 files, 4 directories) |
| Destructive command detection (rm -rf, chmod -R, etc.) | No | Yes |
| Shell obfuscation detection (IFS, unicode, etc.) | No | Yes (7 patterns) |
| Dangerous interpreter detection (python -c, curl\|bash) | No | Yes (8 patterns) |
| Tool filtering for denied tools | No | Yes |
| Denial tracking with thresholds | No | Yes (3 consecutive / 20 total) |
| Case-insensitive matching on macOS | Partial | Full |

---

## Troubleshooting

**Binary exits with code 137 on macOS:**
This is a code signing issue with Bun-compiled binaries. Use the wrapper script approach from Option 1.

**`bun install` fails:**
Make sure you have Bun 1.3+. Check with `bun --version`. Update with `bun upgrade`.

**Extension doesn't activate:**
Ensure the `opencode` (or `opencode-hardened`) binary is on your PATH. Restart VS Code after installing.

**Permission prompts not appearing for dangerous commands:**
Verify you're running the hardened version: the permission prompts should appear for commands like `rm -rf`, writes to `.bashrc`, etc. If using `bun dev`, make sure you're on the `feat/permission-safety-hardening` branch.
