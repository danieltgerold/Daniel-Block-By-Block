// Builds the "Java core out of date" issue for a push to main whose parity checks failed.
// Usage: node tools/ci/drift-report.mjs <beforeSha> <sha> <runUrl> <author> <repo> <failedJob>...
// Prints {title, body} as JSON. Commit messages are never embedded: they are untrusted text.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function changedRuleFiles(files, rules) {
  return rules.filter(rule => files.includes(rule.js));
}

export function driftIssue({ sha, runUrl, failedJobs, changed, author, repo }) {
  const short = sha.slice(0, 7);
  const rows = changed.length
    ? changed.map(rule => `- \`${rule.js}\` (${rule.covers}) -> \`${rule.java}\``).join('\n')
    : 'No listed rule file changed in this push. A shared fixture, the generator or the Java build itself may have broken; read the run log.';
  const body = [
    `Commit [${short}](https://github.com/${repo}/commit/${sha}) by ${author} made the parity checks fail on main (failed jobs: ${failedJobs.join(', ')}).`,
    '',
    '**Rule files changed**',
    rows,
    '',
    '**To fix**',
    '1. Update the Java counterpart so the same inputs give the same bits.',
    '2. Run `npm run golden`, then `./gradlew :core:test` and `npm run test:parity`.',
    '3. Open a pull request with the Java change and the regenerated golden files.',
    '',
    `Run: ${runUrl}`,
    '',
    'Opened automatically; later failures on main are added as comments.',
  ].join('\n');
  return { title: `Java core out of date after ${short}`, body };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [before, sha, runUrl, author, repo, ...failedJobs] = process.argv.slice(2);
  const rules = JSON.parse(readFileSync(new URL('../parity/rule-files.json', import.meta.url), 'utf8')).rules;
  let files = [];
  try {
    files = execFileSync('git', ['diff', '--name-only', before, sha], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').filter(Boolean);
  } catch { /* first push or unknown base: report without a file list */ }
  console.log(JSON.stringify(driftIssue({ sha, runUrl, failedJobs, changed: changedRuleFiles(files, rules), author, repo })));
}
