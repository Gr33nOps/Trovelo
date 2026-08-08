import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

// image-size has no patched release as of this audit. It is used by Metro at
// build time, not by the mobile runtime. Keep the exception narrow so a new
// advisory or any critical finding still fails CI immediately.
const acceptedBuildOnlyAdvisories = new Set([
  'https://github.com/advisories/GHSA-5p2g-fcmc-qvqq',
  'https://github.com/advisories/GHSA-w3rx-r6r6-pgpr',
]);

const result = spawnSync('npm', ['audit', '--omit=dev', '--json'], {
  encoding: 'utf8',
  maxBuffer: 20 * 1024 * 1024,
});

assert.ok(result.stdout, `npm audit produced no JSON output: ${result.stderr || 'unknown error'}`);
const report = JSON.parse(result.stdout);
const vulnerabilities = Object.values(report.vulnerabilities ?? {});
const advisoryUrls = new Set(
  vulnerabilities.flatMap((item) =>
    (item.via ?? []).flatMap((cause) => (typeof cause === 'object' && cause.url ? [cause.url] : [])),
  ),
);
const unexpected = [...advisoryUrls].filter((url) => !acceptedBuildOnlyAdvisories.has(url));
const critical = report.metadata?.vulnerabilities?.critical ?? 0;

assert.equal(critical, 0, `Dependency audit found ${critical} critical vulnerabilities`);
assert.deepEqual(unexpected, [], `Dependency audit found unreviewed advisories: ${unexpected.join(', ')}`);

const total = report.metadata?.vulnerabilities?.total ?? 0;
if (total === 0) {
  console.log('Dependency audit passed with no known vulnerabilities.');
} else {
  assert.ok(advisoryUrls.size > 0, 'Dependency audit failed without a traceable reviewed advisory');
  console.warn(
    `Dependency audit contains ${total} transitive findings, all tracing to the reviewed build-only image-size advisories.`,
  );
}
