#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import path from 'node:path';
import { createClient, collect, summarize } from './stats.mjs';
import { render, injectTable, ACCENTS, CHARTS } from './render.mjs';

const HELP = `github-profile-charts: draw your GitHub stats as SVG cards

Usage: node src/cli.mjs --user <login> [options]

  --user       GitHub login (default: the token's owner)
  --out        output folder (default: profile-charts)
  --accent     ${Object.keys(ACCENTS).join(' | ')} (default: blue)
  --charts     comma-separated subset of ${CHARTS.join(',')} (default: all)
  --readme     README to update between <!-- PROFILE-CHARTS:START/END --> markers
  --subtitles  JSON object of chart → subtitle; {placeholders} take summary fields

Token: STATS_TOKEN, then GITHUB_TOKEN, then \`gh auth token\`.
`;

function readGhToken() {
  try {
    return execSync('gh auth token', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
}

function parseOptions(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      user: { type: 'string', default: process.env.INPUT_USER || '' },
      out: { type: 'string', default: process.env.INPUT_OUT || 'profile-charts' },
      accent: { type: 'string', default: process.env.INPUT_ACCENT || 'blue' },
      charts: { type: 'string', default: process.env.INPUT_CHARTS || CHARTS.join(',') },
      readme: { type: 'string', default: process.env.INPUT_README || '' },
      subtitles: { type: 'string', default: process.env.INPUT_SUBTITLES || '' },
      help: { type: 'boolean', default: false },
    },
  });

  if (!ACCENTS[values.accent]) throw new Error(`Unknown accent "${values.accent}". Use one of: ${Object.keys(ACCENTS).join(', ')}`);

  const charts = values.charts.split(',').map((c) => c.trim()).filter(Boolean);
  const unknown = charts.filter((c) => !CHARTS.includes(c));

  if (unknown.length) throw new Error(`Unknown chart(s): ${unknown.join(', ')}. Use: ${CHARTS.join(', ')}`);

  let subtitles = {};

  if (values.subtitles) {
    try {
      subtitles = JSON.parse(values.subtitles);
    } catch {
      throw new Error('--subtitles must be a JSON object, e.g. {"yearly":"Since day one"}');
    }
  }

  return { ...values, charts, subtitles };
}

async function main() {
  const options = parseOptions(process.argv.slice(2));

  if (options.help) {
    console.log(HELP);

    return;
  }

  const token = process.env.STATS_TOKEN || process.env.GITHUB_TOKEN || readGhToken();

  if (!token) throw new Error('No GitHub token. Set STATS_TOKEN or GITHUB_TOKEN, or sign in with `gh auth login`.');

  const graphql = createClient(token);
  const login = options.user || (await graphql('{ viewer { login } }')).viewer.login;
  const outDir = path.resolve(options.out);
  const dataPath = path.join(outDir, 'stats.json');
  const previous = await readFile(dataPath, 'utf8').then(JSON.parse).catch(() => null);
  const summary = summarize(await collect(graphql, login), previous);

  await mkdir(outDir, { recursive: true });

  for (const [name, svg] of Object.entries(render(summary, options))) await writeFile(path.join(outDir, name), svg);

  // Token-less runs must not overwrite the private numbers saved by a full run.
  if (summary.fullRun || !previous) await writeFile(dataPath, `${JSON.stringify(summary, null, 2)}\n`);

  if (options.readme) {
    const readme = await readFile(options.readme, 'utf8');
    await writeFile(options.readme, injectTable(readme, summary));
  }

  const scope = summary.fullRun ? 'full (owner token)' : 'calendar only (PRs and languages from last full run)';
  console.log(`Wrote ${login}'s charts to ${options.out}: ${scope}. ${summary.allTime} contributions, ${summary.mergedPullRequests} merged PRs.`);
}

main().catch((error) => {
  console.error(`github-profile-charts: ${error.message}`);
  process.exit(1);
});
