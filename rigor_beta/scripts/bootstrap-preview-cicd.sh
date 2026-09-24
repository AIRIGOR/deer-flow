#!/usr/bin/env bash
set -euo pipefail

REPO="AIRIGOR/deer-flow"
BRANCH="feat/rigor-netlify-beta-v1"
CONFIG="$HOME/.netlify/config.json"

echo "RIGOR preview automation bootstrap"
echo "Repository: $REPO"
echo "Branch: $BRANCH"
echo

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI is not available in this Codespace."
  exit 1
fi

gh auth status >/dev/null

extract_token() {
  python - "$CONFIG" <<'PY'
import json
import sys

path=sys.argv[1]
try:
    data=json.load(open(path, encoding="utf-8"))
except Exception:
    raise SystemExit(1)

def walk(value):
    if isinstance(value, dict):
        token=value.get("token")
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

NETLIFY_TOKEN=""
if [ -f "$CONFIG" ]; then
  NETLIFY_TOKEN="$(extract_token 2>/dev/null || true)"
fi

if [ -z "$NETLIFY_TOKEN" ]; then
  echo "One-time Netlify authorization is required."
  echo "Approve the Netlify sign-in, then return to this terminal."
  npx -y netlify-cli@latest login --request "Authorize RIGOR preview deployment automation for rigor-flow-preview"
  NETLIFY_TOKEN="$(extract_token 2>/dev/null || true)"
fi

if [ -z "$NETLIFY_TOKEN" ]; then
  echo "Could not read Netlify authorization after login."
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
