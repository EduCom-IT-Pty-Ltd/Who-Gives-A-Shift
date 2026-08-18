#!/usr/bin/env bash
#
# Pushes every populated variable in .env.local to Vercel, for the environments
# named below. Values go over stdin, so nothing lands in your shell history, and
# they are taken verbatim from a file we already validated — no hand-pasting,
# no stray whitespace.
#
#   npx vercel login && npx vercel link     # once
#   ./scripts/push-env-to-vercel.sh
#
set -euo pipefail

ENV_FILE="${1:-.env.local}"
TARGETS=(production preview development)

[ -f "$ENV_FILE" ] || { echo "No $ENV_FILE found." >&2; exit 1; }

while IFS= read -r line; do
  # Skip comments and anything that is not KEY=VALUE.
  [[ "$line" =~ ^[A-Z][A-Z0-9_]*= ]] || continue

  key="${line%%=*}"
  value="${line#*=}"

  # Deliberately-empty settings (optional gates, auto-detected URLs) are left
  # unset in Vercel rather than pushed as empty strings.
  if [ -z "$value" ]; then
    echo "· skipping $key (empty)"
    continue
  fi

  for target in "${TARGETS[@]}"; do
    npx vercel env rm "$key" "$target" --yes >/dev/null 2>&1 || true
    printf '%s' "$value" | npx vercel env add "$key" "$target" >/dev/null
  done
  echo "✓ $key -> ${TARGETS[*]}"
done < "$ENV_FILE"

echo
echo "Done. Trigger a fresh build so the NEXT_PUBLIC_* values are inlined:"
echo "  npx vercel --prod"
