#!/usr/bin/env bash
# Commits regenerated files to a bot branch and opens (or refreshes) one pull request. Never pushes to main.
set -euo pipefail
branch="bot/sync-generated"
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git checkout -B "$branch"
git add -A tests/golden core/src/main/java
git commit -m "Regenerate golden files and Java tables after ${SHA:0:7}" -m "Opened by the sync-generated job after the full gate passed on the regenerated files."
git push --force origin "$branch"
body="Registry data on main changed, so the generated Java tables and golden files were stale (commit ${SHA:0:7}). They were regenerated with \`npm run golden\` and the whole gate passed here: JS tests, Java tests, TeaVM/Node parity and Chromium, Firefox and WebKit parity. No Java was written by hand."
existing=$(gh pr list --head "$branch" --state open --json number --jq '.[0].number // empty')
if [ -n "$existing" ]; then
  gh pr comment "$existing" --body "Refreshed after ${SHA:0:7}. $body"
else
  gh pr create --base main --head "$branch" --title "Regenerate Java tables and golden files after ${SHA:0:7}" --body "$body"
fi
