#!/usr/bin/env bash
# Builds a deployment-ready ZIP of the source (no node_modules, no secrets, no build output).
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${1:-kingdom-concierge.zip}"
rm -f "$OUT"
if git rev-parse --git-dir >/dev/null 2>&1; then
  git ls-files -z --cached --others --exclude-standard | grep -zv '^\.env$' | xargs -0 zip -q "$OUT"
else
  zip -qr "$OUT" . -x 'node_modules/*' 'dist/*' '.env' '.env.*' '.git/*' '*.zip' '!.env.example'
fi
echo "Created $OUT ($(du -h "$OUT" | cut -f1))"
