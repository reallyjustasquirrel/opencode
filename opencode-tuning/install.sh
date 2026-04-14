#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_DIR="$HOME/.config/opencode"
INSTRUCTIONS_DIR="$CONFIG_DIR/instructions"
BACKUP_DIR="$CONFIG_DIR/backups/$(date +%Y%m%d-%H%M%S)"

SOURCES=(
  "opencode.jsonc"
  "instructions/modes.md"
  "instructions/contracts.md"
)
DESTINATIONS=(
  "$CONFIG_DIR/opencode.jsonc"
  "$INSTRUCTIONS_DIR/modes.md"
  "$INSTRUCTIONS_DIR/contracts.md"
)

# ── backup any existing files ──────────────────────────────────────────────

backup_needed=false
for dest in "${DESTINATIONS[@]}"; do
  [[ -f "$dest" ]] && backup_needed=true && break
done

if [[ "$backup_needed" == true ]]; then
  mkdir -p "$BACKUP_DIR/instructions"
  for dest in "${DESTINATIONS[@]}"; do
    if [[ -f "$dest" ]]; then
      rel="${dest#"$CONFIG_DIR/"}"
      cp "$dest" "$BACKUP_DIR/$rel"
      echo "backed up:  $rel"
    fi
  done
fi

# ── install ────────────────────────────────────────────────────────────────

mkdir -p "$INSTRUCTIONS_DIR"

for i in "${!SOURCES[@]}"; do
  cp "$SCRIPT_DIR/${SOURCES[$i]}" "${DESTINATIONS[$i]}"
  echo "installed:  ${DESTINATIONS[$i]}"
done

echo ""
echo "done. config: $CONFIG_DIR"
[[ "$backup_needed" == true ]] && echo "backup:     $BACKUP_DIR"
