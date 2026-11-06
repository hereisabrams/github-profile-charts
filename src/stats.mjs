// Fetches contribution data from the GitHub GraphQL API and turns it into one summary object.

const USER_QUERY = `query($login: String!) {
  viewer { login }
  user(login: $login) {
    createdAt
    followers { totalCount }
    repositoriesContributedTo(contributionTypes: [COMMIT, PULL_REQUEST, PULL_REQUEST_REVIEW]) { totalCount }
    pullRequests { totalCount }
    merged: pullRequests(states: MERGED) { totalCount }
  }
}`;

const YEAR_QUERY = `query($login: String!, $from: DateTime!, $to: DateTime!, $withRepos: Boolean!) {
  user(login: $login) {
    contributionsCollection(from: $from, to: $to) {
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount } }
      }
      commitContributionsByRepository(maxRepositories: 100) @include(if: $withRepos) {
        contributions { totalCount }
        repository {
          languages(first: 8, orderBy: { field: SIZE, direction: DESC }) {
            totalSize
            edges { size node { name } }
          }
        }
      }
    }
  }
}`;

export function createClient(token, fetchImpl = fetch) {
  return async function graphql(query, variables = {}, attempt = 1) {
    const response = await fetchImpl('https://api.github.com/graphql', {
      method: 'POST',
      headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'github-profile-charts' },
      body: JSON.stringify({ query, variables }),
    });

    if (response.status >= 500 && attempt < 4) {
      await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));

      return graphql(query, variables, attempt + 1);
    }

    const body = await response.json();

    if (!response.ok || body.errors) {
      throw new Error(`GitHub GraphQL request failed (${response.status}): ${JSON.stringify(body.errors || body.message || body)}`);
    }

    return body.data;
  };
}

export async function collect(graphql, login, now = new Date()) {
  const { viewer, user } = await graphql(USER_QUERY, { login });

  if (!user) throw new Error(`GitHub user "${login}" not found`);

  const isOwnerToken = viewer?.login?.toLowerCase() === login.toLowerCase();
  const firstYear = new Date(user.createdAt).getUTCFullYear();
  const years = [];

  for (let year = firstYear; year <= now.getUTCFullYear(); year++) {
    const isCurrentYear = year === now.getUTCFullYear();
    const from = new Date(Date.UTC(year, 0, 1)).toISOString();
    const to = isCurrentYear ? now.toISOString() : new Date(Date.UTC(year, 11, 31, 23, 59, 59)).toISOString();
    const data = await graphql(YEAR_QUERY, { login, from, to, withRepos: isOwnerToken });

    years.push({ year, ...data.user.contributionsCollection });
  }

  return { login, user, years, isOwnerToken };
}

export function weightLanguages(years) {
  const totals = new Map();

  for (const { commitContributionsByRepository = [] } of years) {
    for (const { contributions, repository } of commitContributionsByRepository) {
      const { totalSize, edges } = repository.languages;

      if (!totalSize) continue;

      for (const { size, node } of edges) {
        totals.set(node.name, (totals.get(node.name) || 0) + (contributions.totalCount * size) / totalSize);
      }
    }
  }

  const sum = [...totals.values()].reduce((a, b) => a + b, 0);

  if (!sum) return [];

  return [...totals.entries()]
    .map(([name, weight]) => ({ name, share: weight / sum }))
    .sort((a, b) => b.share - a.share);
}

export function computeStreaks(days) {
  let longest = { length: 0, start: null, end: null };
  let run = { length: 0, start: null };

  for (const day of days) {
    if (day.contributionCount === 0) {
      run = { length: 0, start: null };
      continue;
    }

    run = { length: run.length + 1, start: run.start || day.date };

    if (run.length > longest.length) longest = { ...run, end: day.date };
  }

  // A quiet today has not broken the streak yet.
  const lastCounted = days.at(-1)?.contributionCount === 0 ? days.length - 2 : days.length - 1;
  let current = 0;

  for (let i = lastCounted; i >= 0 && days[i].contributionCount > 0; i--) current++;

  return { longest, current };
}

export function flattenDays(years) {
  const byDate = new Map();

  for (const year of years) {
    for (const week of year.contributionCalendar.weeks) {
      for (const day of week.contributionDays) byDate.set(day.date, day);
    }
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function summarize({ login, user, years, isOwnerToken }, previous = null, generatedAt = new Date()) {
  const days = flattenDays(years);
  const lastYear = days.slice(-365);
  const busiest = days.reduce((best, d) => (d.contributionCount > best.contributionCount ? d : best), days[0]);
  const activeDays = lastYear.filter((d) => d.contributionCount > 0).length;
  const lastYearTotal = lastYear.reduce((a, d) => a + d.contributionCount, 0);
  const monthly = new Map();
  const weekday = Array(7).fill(0);

  for (const d of lastYear) {
    const key = d.date.slice(0, 7);
    monthly.set(key, (monthly.get(key) || 0) + d.contributionCount);
    weekday[(new Date(`${d.date}T00:00:00Z`).getUTCDay() + 6) % 7] += d.contributionCount;
  }

  const live = {
    mergedPullRequests: user.merged.totalCount,
    pullRequests: user.pullRequests.totalCount,
    languages: weightLanguages(years),
  };
  // Without the owner's token GitHub hides private PRs and repositories, so keep the last full numbers.
  const kept = isOwnerToken || !previous ? live : {
    mergedPullRequests: Math.max(previous.mergedPullRequests ?? 0, live.mergedPullRequests),
    pullRequests: Math.max(previous.pullRequests ?? 0, live.pullRequests),
    languages: previous.languages?.length ? previous.languages : live.languages,
  };

  return {
    login,
    generatedAt: generatedAt.toISOString(),
    fullRun: isOwnerToken,
    memberSince: user.createdAt.slice(0, 10),
    followers: user.followers.totalCount,
    reposContributedTo: user.repositoriesContributedTo.totalCount,
    ...kept,
    allTime: days.reduce((a, d) => a + d.contributionCount, 0),
    yearly: years.map((y) => ({ year: y.year, total: y.contributionCalendar.totalContributions })),
    lastYearTotal,
    activeDays,
    averagePerActiveDay: activeDays ? Math.round(lastYearTotal / activeDays) : 0,
    busiestDay: { date: busiest?.date ?? generatedAt.toISOString().slice(0, 10), count: busiest?.contributionCount ?? 0 },
    streaks: computeStreaks(days),
    monthly: [...monthly.entries()].map(([month, total]) => ({ month, total })).slice(-12),
    weekday: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, i) => ({ day, total: weekday[i] })),
  };
}
