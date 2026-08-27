#!/usr/bin/env bash
# Entry point for the Railway cron service. Runs the same update.mjs used by
# the GitHub Actions workflow, but since Railway reuses one built image across
# every scheduled run (it doesn't rebuild per-run), this always starts from a
# fresh clone of main rather than the image's baked-in copy of data/.
set -euo pipefail

: "${GITHUB_TOKEN:?GITHUB_TOKEN env var is required}"
: "${GITHUB_REPO:?GITHUB_REPO env var is required, e.g. slaytr/jax}"

REPO_URL="https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPO}.git"
WORKDIR="$(mktemp -d)"

git clone --depth 1 --branch main "$REPO_URL" "$WORKDIR"
cd "$WORKDIR"

node scripts/update.mjs

if [ -z "$(git status --porcelain data)" ]; then
  echo "No hiscore changes to commit."
  exit 0
fi

git config user.name  "railway-cron[bot]"
git config user.email "railway-cron@users.noreply.github.com"
git add data
git commit -m "chore: hiscore snapshot $(date -u '+%Y-%m-%d %H:%M UTC')"

for attempt in 1 2 3; do
  if git push origin main; then
    exit 0
  fi
  echo "Push rejected (attempt $attempt/3) — rebasing onto latest main and retrying."
  git fetch origin main
  git rebase origin/main
done

echo "Failed to push after 3 attempts" >&2
exit 1
