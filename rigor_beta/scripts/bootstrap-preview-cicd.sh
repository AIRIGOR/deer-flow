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

users=data.get("users") if isinstance(data, dict) else None
if isinstance(users, dict):
    for user in users.values():
        if not isinstance(user, dict):
            continue
        auth=user.get("auth")
        if isinstance(auth, dict):
            token=auth.get("token")
            if isinstance(token, str) and token.strip():
                print(token.strip())
                raise SystemExit(0)

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
  echo "A Netlify sign-in page will open. Approve access, then return here."
  npx -y netlify-cli@latest login
  NETLIFY_TOKEN="$(extract_token 2>/dev/null || true)"
fi

if [ -z "$NETLIFY_TOKEN" ]; then
  echo "Could not read the Netlify authorization after login."
  exit 1
fi

echo "Saving Netlify authorization to GitHub Actions secrets..."
gh secret set NETLIFY_AUTH_TOKEN --repo "$REPO" --body "$NETLIFY_TOKEN"
unset NETLIFY_TOKEN

echo "Triggering isolated RIGOR preview deployment..."
gh workflow run "RIGOR Preview Auto Deploy"   --repo "$REPO"   --ref "$BRANCH"

echo
echo "Bootstrap complete."
echo "GitHub now owns the preview deploy loop."
echo "Production was not promoted."
