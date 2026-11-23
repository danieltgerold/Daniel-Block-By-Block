import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { changedRuleFiles, driftIssue } from '../tools/ci/drift-report.mjs';

const rules = JSON.parse(readFileSync(new URL('../tools/parity/rule-files.json', import.meta.url), 'utf8')).rules;

test('only rule files count, and each reports its Java counterpart', () => {
  const hits = changedRuleFiles(['src/movement.js', 'src/chat-ui.js', 'README.md', 'src/block-shapes.js'], rules);
  assert.deepEqual(hits.map(h => h.js), ['src/movement.js', 'src/block-shapes.js']);
  assert.match(hits[0].java, /Movement\.java$/);
  assert.deepEqual(changedRuleFiles(['src/chat-ui.js', 'tests/x.test.js'], rules), []);
  assert.deepEqual(changedRuleFiles([], rules), []);
});

test('every listed rule file and Java counterpart exists in the repo', () => {
  for (const rule of rules) for (const path of [rule.js, rule.java])
    assert.ok(existsSync(new URL(`../${path}`, import.meta.url)), `${path} is listed but missing`);
});

test('issue names the commit, the changed rules and the failing jobs; no raw commit text is embedded', () => {
  const issue = driftIssue({ sha: '0123456789abcdef', runUrl: 'https://example.test/run/1', failedJobs: ['core', 'golden'],
    changed: changedRuleFiles(['src/voxel-world.js'], rules), author: 'Codex', repo: 'o/r' });
  assert.match(issue.title, /^Java core out of date after 0123456/);
  assert.match(issue.body, /src\/voxel-world\.js/);
  assert.match(issue.body, /core\/src\/main\/java\/blockbyblock\/core\/world\//);
  assert.match(issue.body, /core, golden/);
  assert.match(issue.body, /npm run golden/);
  const needsHand = driftIssue({ sha: 'abcdef0', runUrl: 'u', failedJobs: ['golden', 'sync-generated'], changed: changedRuleFiles(['src/movement.js'], rules), author: 'x', repo: 'o/r' });
  assert.match(needsHand.body, /automatic sync could not fix this/i);
  assert.doesNotMatch(issue.body, /automatic sync could not fix this/i, 'only mentioned when the sync job itself failed');
  const unknown = driftIssue({ sha: 'abcdef0', runUrl: 'u', failedJobs: ['golden'], changed: [], author: 'x', repo: 'o/r' });
  assert.match(unknown.body, /No listed rule file changed/);
});
