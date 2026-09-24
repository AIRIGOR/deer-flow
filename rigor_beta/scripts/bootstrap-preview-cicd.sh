#!/usr/bin/env bash
set -euo pipefail

REPO="AIRIGOR/deer-flow"
BRANCH="feat/rigor-netlify-beta-v1"

echo "RIGOR preview automation bootstrap"
echo "Repository: $REPO"
echo "Branch: $BRANCH"
echo

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI is not available in this Codespace."
  exit 1
fi

gh auth status >/dev/null

extract_token_from_file() {
  python - "$1" <<'PY'
import json
import sys

path=sys.argv[1]
try:
    data=json.load(open(path, encoding="utf-8"))
except Exception:
    raise SystemExit(1)

KEYS=("token","access_token","authToken","auth_token")

def walk(value):
    if isinstance(value, dict):
        for key in KEYS:
            token=value.get(key)
            if isinstance(token, str) and token.strip():
                return token.strip()
        for child in value.values():
            found=walk(child)
            if found:
                return found
    elif isinstance(value, list):
        for child in value:
            found=walk(child)
            if found:
                return found
    return None

found=walk(data)
if found:
    print(found)
    raise SystemExit(0)
raise SystemExit(1)
PY
}

find_netlify_token() {
  local file token
  local candidates=(
    "$HOME/.netlify/config.json"
    "$HOME/.config/netlify/config.json"
    "$HOME/.config/configstore/netlify-cli.json"
    "$HOME/.config/configstore/netlify.json"
  )

  for file in "${candidates[@]}"; do
    if [ -f "$file" ]; then
      token="$(extract_token_from_file "$file" 2>/dev/null || true)"
      if [ -n "$token" ]; then
        printf '%s' "$token"
        return 0
      fi
    fi
  done

  while IFS= read -r file; do
    token="$(extract_token_from_file "$file" 2>/dev/null || true)"
    if [ -n "$token" ]; then
      printf '%s' "$token"
      return 0
    fi
  done < <(find "$HOME" -maxdepth 4 -type f \( -path "*/netlify/*" -o -name "*netlify*.json" \) 2>/dev/null)

  return 1
}

NETLIFY_TOKEN="$(find_netlify_token || true)"

if [ -z "$NETLIFY_TOKEN" ]; then
  echo "One-time Netlify authorization is required."
  echo "Approve the Netlify sign-in, then return to this terminal."
  npx -y netlify-cli@latest login --request "Authorize RIGOR preview deployment automation for rigor-flow-preview"
  NETLIFY_TOKEN="$(find_netlify_token || true)"
fi

if [ -z "$NETLIFY_TOKEN" ]; then
  echo "Netlify login completed, but the credential file could not be located."
  echo "Run: npx netlify status"
  exit 1
fi

echo "Saving Netlify authorization to GitHub Actions..."
gh secret set NETLIFY_AUTH_TOKEN --repo "$REPO" --body "$NETLIFY_TOKEN"
unset NETLIFY_TOKEN

echo "Triggering RIGOR CI + isolated preview deployment..."
gh workflow run "RIGOR CI"   --repo "$REPO"   --ref "$BRANCH"

echo
echo "Bootstrap complete."
echo "Future RIGOR pushes will test and deploy the isolated preview automatically."
echo "Primary production was not promoted."
