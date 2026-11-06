import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStreaks, weightLanguages, flattenDays, summarize } from '../src/stats.mjs';
import { render, niceMax, injectTable } from '../src/render.mjs';

const day = (date, contributionCount) => ({ date, contributionCount });

test('longest and current streaks', () => {
  const days = [day('2026-01-01', 1), day('2026-01-02', 3), day('2026-01-03', 0), day('2026-01-04', 2), day('2026-01-05', 1), day('2026-01-06', 1)];
  const { longest, current } = computeStreaks(days);

  assert.deepEqual(longest, { length: 3, start: '2026-01-04', end: '2026-01-06' });
  assert.equal(current, 3);
});

test('a quiet today keeps the current streak alive', () => {
  const days = [day('2026-01-01', 1), day('2026-01-02', 2), day('2026-01-03', 0)];

  assert.equal(computeStreaks(days).current, 2);
});

test('a quiet yesterday ends the current streak', () => {
  const days = [day('2026-01-01', 1), day('2026-01-02', 0), day('2026-01-03', 0)];

  assert.equal(computeStreaks(days).current, 0);
});

test('languages are weighted by commits per repository', () => {
  const years = [{
    commitContributionsByRepository: [
      { contributions: { totalCount: 30 }, repository: { languages: { totalSize: 100, edges: [{ size: 100, node: { name: 'TypeScript' } }] } } },
      { contributions: { totalCount: 10 }, repository: { languages: { totalSize: 100, edges: [{ size: 50, node: { name: 'Python' } }, { size: 50, node: { name: 'TypeScript' } }] } } },
      { contributions: { totalCount: 99 }, repository: { languages: { totalSize: 0, edges: [] } } },
    ],
  }];
  const result = weightLanguages(years);

  assert.equal(result[0].name, 'TypeScript');
  assert.equal(result[0].share, 35 / 40);
  assert.equal(result[1].share, 5 / 40);
});

test('days that appear in two year windows are counted once', () => {
  const years = [
    { contributionCalendar: { weeks: [{ contributionDays: [day('2025-12-31', 2), day('2026-01-01', 5)] }] } },
    { contributionCalendar: { weeks: [{ contributionDays: [day('2026-01-01', 5), day('2026-01-02', 1)] }] } },
  ];

  assert.deepEqual(flattenDays(years).map((d) => d.date), ['2025-12-31', '2026-01-01', '2026-01-02']);
});

test('niceMax rounds up to a readable axis top', () => {
  assert.equal(niceMax(10572), 20000);
  assert.equal(niceMax(2843), 5000);
  assert.equal(niceMax(180), 200);
  assert.equal(niceMax(0), 1);
});

function fakeCollected({ isOwnerToken }) {
  return {
    login: 'octo',
    isOwnerToken,
    user: { createdAt: '2025-06-01T00:00:00Z', followers: { totalCount: 1 }, repositoriesContributedTo: { totalCount: 2 }, pullRequests: { totalCount: 4 }, merged: { totalCount: 3 } },
    years: [{
      year: 2026,
      contributionCalendar: { totalContributions: 6, weeks: [{ contributionDays: [day('2026-03-02', 2), day('2026-03-03', 4)] }] },
      ...(isOwnerToken ? { commitContributionsByRepository: [{ contributions: { totalCount: 1 }, repository: { languages: { totalSize: 1, edges: [{ size: 1, node: { name: 'Go' } }] } } }] } : {}),
    }],
  };
}

test('a token-less run keeps the private numbers from the last full run', () => {
  const previous = { mergedPullRequests: 900, pullRequests: 950, languages: [{ name: 'Rust', share: 1 }] };
  const s = summarize(fakeCollected({ isOwnerToken: false }), previous);

  assert.equal(s.mergedPullRequests, 900);
  assert.deepEqual(s.languages, previous.languages);
  assert.equal(s.allTime, 6);
});

test('renders light and dark SVGs and skips languages without data', () => {
  const s = summarize(fakeCollected({ isOwnerToken: false }));
  const files = render(s, { accent: 'violet' });

  assert.ok(files['stats-light.svg'].startsWith('<svg'));
  assert.ok(files['yearly-dark.svg'].includes('#9085e9'));
  assert.equal(files['languages-light.svg'], undefined);
  assert.equal(Object.keys(files).length, 8);
});

test('subtitle placeholders and escaping', () => {
  const s = summarize(fakeCollected({ isOwnerToken: true }));
  const files = render(s, { charts: ['yearly'], subtitles: { yearly: '{allTime} & counting <3' } });

  assert.match(files['yearly-light.svg'], /6 &amp; counting &lt;3/);
});

test('README table goes between the markers', () => {
  const s = summarize(fakeCollected({ isOwnerToken: true }));
  const readme = 'top\n<!-- PROFILE-CHARTS:START -->\nold\n<!-- PROFILE-CHARTS:END -->\nbottom';
  const out = injectTable(readme, s);

  assert.match(out, /\| All-time contributions \| 6 \|/);
  assert.ok(!out.includes('old'));
  assert.ok(out.endsWith('bottom'));
});
