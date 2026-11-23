#!/usr/bin/env bash
# Opens the drift issue, or comments on the open one. Inputs arrive as environment variables so that
# nothing from the push is interpolated into shell code.
set -euo pipefail
jobs=()
[ "${CORE:-}" = failure ] && jobs+=(core)
[ "${GOLDEN:-}" = failure ] && jobs+=(golden)
[ "${SYNC:-}" = failure ] && jobs+=(sync-generated)
node tools/ci/drift-report.mjs "$BEFORE" "$SHA" "$RUN_URL" "$AUTHOR" "$REPO" "${jobs[@]}" > report.json
node -e "const r=require('./report.json');require('fs').writeFileSync('title.txt',r.title);require('fs').writeFileSync('body.md',r.body)"
gh label create java-drift --color D93F0B --description "Java core is behind the JS rules" >/dev/null 2>&1 || true
existing=$(gh issue list --label java-drift --state open --json number --jq '.[0].number // empty')
if [ -n "$existing" ]; then
  gh issue comment "$existing" --body-file body.md
else
  gh issue create --title "$(cat title.txt)" --body-file body.md --label java-drift
fi
