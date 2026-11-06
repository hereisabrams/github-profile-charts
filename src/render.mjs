// Draws the summary as standalone SVG cards, one light and one dark file per chart.

const CATEGORICAL = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181'],
};

export const ACCENTS = {
  blue: { light: ['#2a78d6', '#cde2fb'], dark: ['#3987e5', '#184f95'] },
  violet: { light: ['#6250d6', '#ddd8fa'], dark: ['#9085e9', '#3b3482'] },
  aqua: { light: ['#1baf7a', '#c9efe0'], dark: ['#199e70', '#0f5640'] },
  orange: { light: ['#eb6834', '#fbdccf'], dark: ['#d95926', '#7a3216'] },
  pink: { light: ['#e87ba4', '#fadbe7'], dark: ['#d55181', '#76304a'] },
};

const SURFACES = {
  light: { surface: '#ffffff', border: '#d0d7de', text: '#1f2328', secondary: '#59636e', muted: '#818b98', grid: '#eaeef2', other: '#afb8c1' },
  dark: { surface: '#0d1117', border: '#30363d', text: '#e6edf3', secondary: '#9198a1', muted: '#6e7681', grid: '#21262d', other: '#484f58' },
};

export const DEFAULT_SUBTITLES = {
  stats: 'Public and private contributions',
  yearly: 'Every year since joining GitHub',
  monthly: '{lastYearTotal} contributions · ~{averagePerActiveDay} per active day',
  weekday: 'Last 365 days',
  languages: 'Weighted by commits per repository',
};

export const CHARTS = ['stats', 'yearly', 'monthly', 'weekday', 'languages'];

const FONT = `-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans',Helvetica,Arial,sans-serif`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const fmt = (n) => Math.round(n).toLocaleString('en-US');
export const compact = (n) => (n >= 10000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : fmt(n));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function prettyDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);

  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

export function niceMax(value) {
  const exp = 10 ** Math.floor(Math.log10(value || 1));

  return [1, 2, 2.5, 5, 10].map((s) => s * exp).find((s) => s >= value) ?? 10 * exp;
}

function fillTemplate(text, s) {
  return text.replace(/\{(\w+)\}/g, (_, key) => (typeof s[key] === 'number' ? fmt(s[key]) : s[key] ?? ''));
}

function theme(mode, accent) {
  const [main, soft] = (ACCENTS[accent] || ACCENTS.blue)[mode];

  return { ...SURFACES[mode], accent: main, accentSoft: soft, categorical: CATEGORICAL[mode] };
}

function frame(t, width, height, title, subtitle, body, label) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(label)}">
<style>
  text { font-family: ${FONT}; }
  .title { font-size: 16px; font-weight: 600; fill: ${t.text}; }
  .sub { font-size: 12px; fill: ${t.secondary}; }
  .tick { font-size: 11px; fill: ${t.muted}; }
  .val { font-size: 12px; font-weight: 600; fill: ${t.text}; }
  .lbl { font-size: 12px; fill: ${t.secondary}; }
  .big { font-size: 28px; font-weight: 700; fill: ${t.text}; letter-spacing: -0.5px; }
  .grow { transform-box: fill-box; transform-origin: bottom; animation: grow .9s cubic-bezier(.2,.8,.2,1) both; }
  .growx { transform-box: fill-box; transform-origin: left; animation: growx .9s cubic-bezier(.2,.8,.2,1) both; }
  .fade { animation: fade .6s ease-out both; }
  @keyframes grow { from { transform: scaleY(0); } }
  @keyframes growx { from { transform: scaleX(0); } }
  @keyframes fade { from { opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { .grow, .growx, .fade { animation: none; } }
</style>
<rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="12" fill="${t.surface}" stroke="${t.border}"/>
<text class="title" x="24" y="36">${esc(title)}</text>
<text class="sub" x="24" y="56">${esc(subtitle)}</text>
${body}
</svg>
`;
}

// A column rising from the baseline: 4px rounded top, square foot.
function columnPath(x, y, w, h, r = 4) {
  const rr = Math.min(r, h, w / 2);

  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

function columnChart(t, { title, subtitle, items, highlightLast, labelAll }) {
  const width = 440, height = 300;
  const left = 52, right = 24, top = 84, bottom = 36;
  const plotW = width - left - right, plotH = height - top - bottom;
  const maxValue = Math.max(0, ...items.map((i) => i.value));
  const max = niceMax(maxValue);
  const slot = plotW / Math.max(items.length, 1);
  const barW = Math.min(44, slot * 0.72 - 2);
  const isCrowded = items.length > 8;
  const isVeryCrowded = items.length > 14;
  const grid = [0, 0.5, 1]
    .map((f) => {
      const y = top + plotH - f * plotH;

      return `<line x1="${left}" x2="${width - right}" y1="${y}" y2="${y}" stroke="${t.grid}"/><text class="tick" x="${left - 8}" y="${y + 4}" text-anchor="end">${compact(max * f)}</text>`;
    })
    .join('');
  const bars = items
    .map((item, i) => {
      const h = item.value ? Math.max(2, (item.value / max) * plotH) : 0;
      const x = left + i * slot + (slot - barW) / 2;
      const y = top + plotH - h;
      const isLast = i === items.length - 1;
      const fill = !highlightLast || isLast ? t.accent : t.accentSoft;
      const showValue = item.value && ((labelAll && !isCrowded) || item.value === maxValue || isLast);
      const showTick = !isVeryCrowded || isLast || (items.length - 1 - i) % 2 === 0;
      const tick = isCrowded && /^\d{4}$/.test(item.label) ? `'${item.label.slice(2)}` : item.label;
      const bar = h ? `<path class="grow" style="animation-delay:${(i * 0.06).toFixed(2)}s" d="${columnPath(x, y, barW, h)}" fill="${fill}"><title>${esc(item.label)}: ${fmt(item.value)}</title></path>` : '';
      const value = showValue ? `<text class="val fade" x="${x + barW / 2}" y="${y - 8}" text-anchor="middle" style="animation-delay:${(0.5 + i * 0.06).toFixed(2)}s">${compact(item.value)}</text>` : '';

      const tickText = showTick ? `<text class="tick" x="${x + barW / 2}" y="${height - 14}" text-anchor="middle">${esc(tick)}</text>` : '';

      return `${bar}${value}${tickText}`;
    })
    .join('\n');

  return frame(t, width, height, title, subtitle, `${grid}\n${bars}`, `${title}. ${items.map((i) => `${i.label}: ${i.value}`).join(', ')}`);
}

function statsCard(t, s, subtitle) {
  const width = 900, height = 244;
  const thisYear = s.yearly.at(-1);
  const { longest, current } = s.streaks;
  const tiles = [
    ['All-time contributions', fmt(s.allTime), `since ${prettyDate(s.memberSince)}`],
    [`Contributions in ${thisYear.year}`, fmt(thisYear.total), `${fmt(s.lastYearTotal)} in the last 365 days`],
    ['Pull requests merged', fmt(s.mergedPullRequests), `${fmt(s.pullRequests)} opened`],
    ['Longest streak', `${fmt(longest.length)} days`, longest.start ? `${prettyDate(longest.start)} → ${prettyDate(longest.end)}` : 'no streak yet'],
    ['Current streak', `${fmt(current)} days`, `${s.activeDays} active days in the last year`],
    ['Busiest day', fmt(s.busiestDay.count), prettyDate(s.busiestDay.date)],
  ];
  const colW = (width - 48) / 3;
  const body = tiles
    .map(([label, value, note], i) => {
      const x = 24 + (i % 3) * colW;
      const y = 96 + Math.floor(i / 3) * 76;

      return `<g class="fade" style="animation-delay:${(i * 0.08).toFixed(2)}s"><text class="lbl" x="${x}" y="${y}">${esc(label)}</text><text class="big" x="${x}" y="${y + 30}">${esc(value)}</text><text class="tick" x="${x}" y="${y + 47}">${esc(note)}</text></g>`;
    })
    .join('\n');

  return frame(t, width, height, `${s.login} in numbers`, subtitle, `<line x1="24" x2="${width - 24}" y1="70" y2="70" stroke="${t.grid}"/>\n${body}`, tiles.map((x) => `${x[0]}: ${x[1]}`).join('. '));
}

function weekdayChart(t, s, subtitle) {
  const width = 440, height = 300;
  const left = 56, right = 64, top = 82, rowH = 28;
  const max = Math.max(0, ...s.weekday.map((d) => d.total));
  const plotW = width - left - right;
  const rows = s.weekday
    .map((d, i) => {
      const y = top + i * rowH;
      const w = max && d.total ? Math.max(4, (d.total / max) * plotW) : 0;
      const fill = i >= 5 ? t.accentSoft : t.accent;
      const bar = w ? `<path class="growx" style="animation-delay:${(i * 0.06).toFixed(2)}s" d="M${left},${y + 3}H${left + w - 4}Q${left + w},${y + 3} ${left + w},${y + 7}V${y + 15}Q${left + w},${y + 19} ${left + w - 4},${y + 19}H${left}Z" fill="${fill}"><title>${d.day}: ${fmt(d.total)}</title></path>` : '';

      return `<text class="lbl" x="${left - 10}" y="${y + 15}" text-anchor="end">${d.day}</text>${bar}<text class="val fade" x="${left + w + 8}" y="${y + 15}" style="animation-delay:${(0.5 + i * 0.06).toFixed(2)}s">${compact(d.total)}</text>`;
    })
    .join('\n');

  return frame(t, width, height, 'Contributions by weekday', subtitle, rows, `Contributions by weekday. ${s.weekday.map((d) => `${d.day}: ${d.total}`).join(', ')}`);
}

function languagesChart(t, s, subtitle) {
  const width = 440, height = 300;
  const top5 = s.languages.slice(0, 5);
  const otherShare = 1 - top5.reduce((a, l) => a + l.share, 0);
  const parts = [
    ...top5.map((l, i) => ({ ...l, color: t.categorical[i] })),
    ...(otherShare > 0.005 ? [{ name: 'Other', share: otherShare, color: t.other }] : []),
  ];
  const barX = 24, barY = 84, barW = width - 48, barH = 16, gap = 2, r = 4;
  const usable = barW - gap * (parts.length - 1);
  let cursor = barX;
  const segments = parts
    .map((p, i) => {
      const w = Math.max(2, p.share * usable);
      const isFirst = i === 0, isLast = i === parts.length - 1;
      const x0 = cursor, x1 = cursor + w;
      const rightEdge = isLast ? `H${x1 - r}Q${x1},${barY} ${x1},${barY + r}V${barY + barH - r}Q${x1},${barY + barH} ${x1 - r},${barY + barH}` : `H${x1}V${barY + barH}`;
      const leftEdge = isFirst ? `H${x0 + r}Q${x0},${barY + barH} ${x0},${barY + barH - r}V${barY + r}Q${x0},${barY} ${x0 + r},${barY}` : `H${x0}V${barY}`;
      const path = `<path d="M${isFirst ? x0 + r : x0},${barY}${rightEdge}${leftEdge}Z" fill="${p.color}"><title>${esc(p.name)}: ${(p.share * 100).toFixed(1)}%</title></path>`;
      cursor = x1 + gap;

      return path;
    })
    .join('');
  const legend = parts
    .map((p, i) => {
      const x = 24 + (i % 2) * 200;
      const y = 136 + Math.floor(i / 2) * 44;

      return `<g class="fade" style="animation-delay:${(0.3 + i * 0.07).toFixed(2)}s"><rect x="${x}" y="${y - 10}" width="10" height="10" rx="3" fill="${p.color}"/><text class="lbl" x="${x + 18}" y="${y}">${esc(p.name)}</text><text class="val" x="${x + 18}" y="${y + 19}">${(p.share * 100).toFixed(1)}%</text></g>`;
    })
    .join('\n');

  return frame(t, width, height, 'Languages', subtitle, `<g class="growx">${segments}</g>\n${legend}`, `Languages. ${parts.map((p) => `${p.name}: ${(p.share * 100).toFixed(1)}%`).join(', ')}`);
}

export function render(s, { accent = 'blue', charts = CHARTS, subtitles = {} } = {}) {
  const sub = (name) => fillTemplate(subtitles[name] ?? DEFAULT_SUBTITLES[name], s);
  const files = {};

  for (const mode of ['light', 'dark']) {
    const t = theme(mode, accent);
    const builders = {
      stats: () => statsCard(t, s, sub('stats')),
      yearly: () => columnChart(t, {
        title: 'Contributions per year', subtitle: sub('yearly'), labelAll: true, highlightLast: true,
        items: s.yearly.map((y) => ({ label: String(y.year), value: y.total })),
      }),
      monthly: () => columnChart(t, {
        title: 'Last 12 months', subtitle: sub('monthly'),
        items: s.monthly.map((m) => ({ label: MONTHS[Number(m.month.slice(5)) - 1], value: m.total })),
      }),
      weekday: () => weekdayChart(t, s, sub('weekday')),
      languages: () => (s.languages.length ? languagesChart(t, s, sub('languages')) : null),
    };

    for (const name of charts) {
      const svg = builders[name]?.();

      if (svg) files[`${name}-${mode}.svg`] = svg;
    }
  }

  return files;
}

export function statsTable(s) {
  const rows = [
    ['All-time contributions', fmt(s.allTime)],
    ...s.yearly.map((y) => [`Contributions in ${y.year}`, fmt(y.total)]),
    ['Pull requests merged', fmt(s.mergedPullRequests)],
    ['Longest streak', `${s.streaks.longest.length} days`],
    ['Current streak', `${s.streaks.current} days`],
    ['Busiest day', `${fmt(s.busiestDay.count)} on ${prettyDate(s.busiestDay.date)}`],
    ['Repositories contributed to', fmt(s.reposContributedTo)],
    ...s.languages.slice(0, 5).map((l) => [`Language: ${l.name}`, `${(l.share * 100).toFixed(1)}%`]),
  ];

  return `| Stat | Value |\n|---|---|\n${rows.map(([a, b]) => `| ${a} | ${b} |`).join('\n')}\n\n<sub>Last refreshed ${s.generatedAt.slice(0, 10)}.</sub>`;
}

export function injectTable(readme, s) {
  return readme.replace(/(<!-- PROFILE-CHARTS:START -->)[\s\S]*?(<!-- PROFILE-CHARTS:END -->)/, `$1\n${statsTable(s)}\n$2`);
}
