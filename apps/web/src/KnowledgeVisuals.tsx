import * as d3 from "d3";
import type { KnowledgeSummary } from "./types";

type HistoryPoint = KnowledgeSummary["kanjiXpHistory"][number];
type Totals = KnowledgeSummary["totals"];
type TopKanji = KnowledgeSummary["topKanji"];
type CompositionKey = "kanji" | "words" | "customVocabulary";
type CompositionEntry = {
  key: CompositionKey;
  label: string;
  value: number;
  tracked: number;
  known: number;
};

const typeColors: Record<CompositionKey, string> = {
  kanji: "#078f90",
  words: "#ffc857",
  customVocabulary: "#ff8b5f"
};

const parseDay = d3.utcParse("%Y-%m-%d");
const formatShortDate = d3.utcFormat("%b %-d");

function dateFor(point: HistoryPoint) {
  return parseDay(point.date) ?? new Date(`${point.date}T00:00:00Z`);
}

export function KanjiXpTimeline({ history }: { history: HistoryPoint[] }) {
  if (history.length === 0) {
    return (
      <div className="analytics-empty">
        <strong>No kanji XP yet</strong>
        <span>Capture, look up, or mark kanji as seen to start the timeline.</span>
      </div>
    );
  }

  const width = 960;
  const height = 320;
  const margin = { top: 30, right: 42, bottom: 48, left: 62 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const dated = history.map((point) => ({ ...point, day: dateFor(point) }));
  const firstDay = dated[0]?.day ?? new Date();
  const lastDay = dated.at(-1)?.day ?? firstDay;
  const xDomain: [Date, Date] = firstDay.getTime() === lastDay.getTime()
    ? [d3.utcDay.offset(firstDay, -1), d3.utcDay.offset(lastDay, 1)]
    : [firstDay, lastDay];
  const maxCumulative = Math.max(1, ...dated.map((point) => point.cumulativeXp));
  const maxDaily = Math.max(1, ...dated.map((point) => point.xpGained));
  const x = d3.scaleUtc(xDomain, [margin.left, margin.left + plotWidth]);
  const y = d3.scaleLinear([0, maxCumulative], [margin.top + plotHeight, margin.top]).nice();
  const barY = d3.scaleLinear([0, maxDaily], [0, plotHeight]);
  const line = d3
    .line<(typeof dated)[number]>()
    .x((point) => x(point.day))
    .y((point) => y(point.cumulativeXp))
    .curve(d3.curveMonotoneX);
  const area = d3
    .area<(typeof dated)[number]>()
    .x((point) => x(point.day))
    .y0(margin.top + plotHeight)
    .y1((point) => y(point.cumulativeXp))
    .curve(d3.curveMonotoneX);
  const xTicks = x.ticks(Math.min(6, Math.max(2, dated.length)));
  const yTicks = y.ticks(5);
  const lastPoint = dated.at(-1);

  return (
    <div className="analytics-chart xp-timeline" role="img" aria-label="Kanji experience timeline">
      <svg viewBox={`0 0 ${width} ${height}`}>
        <defs>
          <linearGradient id="xp-area-gradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#0aa6a6" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#0aa6a6" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <rect className="analytics-frame" x="0" y="0" width={width} height={height} rx="12" />
        {yTicks.map((tick) => (
          <g key={tick}>
            <line
              className="analytics-grid-line"
              x1={margin.left}
              x2={margin.left + plotWidth}
              y1={y(tick)}
              y2={y(tick)}
            />
            <text className="analytics-axis-label" x={margin.left - 14} y={y(tick) + 4} textAnchor="end">
              {tick}
            </text>
          </g>
        ))}
        {xTicks.map((tick) => (
          <text className="analytics-axis-label" key={tick.toISOString()} x={x(tick)} y={height - 18} textAnchor="middle">
            {formatShortDate(tick)}
          </text>
        ))}
        {dated.map((point) => {
          const barHeight = Math.max(point.xpGained > 0 ? 4 : 0, barY(point.xpGained));
          return (
            <rect
              className="xp-daily-bar"
              key={point.date}
              x={x(point.day) - 5}
              y={margin.top + plotHeight - barHeight}
              width="10"
              height={barHeight}
              rx="4"
            >
              <title>{`${point.date}: +${point.xpGained} XP, ${point.events} events`}</title>
            </rect>
          );
        })}
        <path className="xp-area" d={area(dated) ?? undefined} />
        <path className="xp-line" d={line(dated) ?? undefined} />
        {dated.map((point, index) => (
          index % 5 === 0 || index === dated.length - 1 || point.xpGained > 0 ? (
            <circle className="xp-point" key={point.date} cx={x(point.day)} cy={y(point.cumulativeXp)} r="5">
              <title>{`${point.date}: ${point.cumulativeXp} cumulative XP`}</title>
            </circle>
          ) : null
        ))}
        {lastPoint && (
          <g className="xp-last-callout">
            <line x1={x(lastPoint.day)} x2={x(lastPoint.day)} y1={margin.top} y2={margin.top + plotHeight} />
            <text x={width - margin.right} y={Math.max(margin.top + 18, y(lastPoint.cumulativeXp) - 12)} textAnchor="end">
              {lastPoint.cumulativeXp.toLocaleString()} XP
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

export function KnowledgeCompositionDonut({ totals }: { totals: Totals }) {
  const width = 360;
  const height = 260;
  const radius = 88;
  const entries: CompositionEntry[] = [
    { key: "kanji", label: "Kanji", value: totals.kanji.xp, tracked: totals.kanji.tracked, known: totals.kanji.known },
    { key: "words", label: "Words", value: totals.words.xp, tracked: totals.words.tracked, known: totals.words.known },
    {
      key: "customVocabulary",
      label: "Custom",
      value: totals.customVocabulary.xp,
      tracked: totals.customVocabulary.tracked,
      known: totals.customVocabulary.known
    }
  ];
  const totalXp = d3.sum(entries, (entry) => entry.value);
  const pie = d3.pie<(typeof entries)[number]>().value((entry) => Math.max(0, entry.value || 0)).sort(null);
  const arc = d3.arc<d3.PieArcDatum<(typeof entries)[number]>>().innerRadius(54).outerRadius(radius).cornerRadius(7);
  const fallbackArc = d3.arc<d3.PieArcDatum<{ value: number }>>().innerRadius(54).outerRadius(radius).cornerRadius(7);

  return (
    <div className="analytics-card composition-card">
      <div>
        <span className="eyebrow">XP mix</span>
        <h3>Knowledge composition</h3>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Knowledge XP composition">
        <g transform={`translate(${width / 2}, ${height / 2 - 8})`}>
          {totalXp > 0 ? (
            pie(entries).map((slice) => (
              <path
                key={slice.data.key}
                d={arc(slice) ?? undefined}
                fill={typeColors[slice.data.key]}
              >
                <title>{`${slice.data.label}: ${slice.data.value} XP`}</title>
              </path>
            ))
          ) : (
            <path
              d={fallbackArc({ data: { value: 1 }, value: 1, index: 0, startAngle: 0, endAngle: Math.PI * 2, padAngle: 0 }) ?? undefined}
              fill="rgba(184, 228, 226, 0.66)"
            />
          )}
          <text className="donut-total" textAnchor="middle" y="-4">
            {totalXp.toLocaleString()}
          </text>
          <text className="donut-caption" textAnchor="middle" y="21">
            total XP
          </text>
        </g>
      </svg>
      <div className="composition-legend">
        {entries.map((entry) => (
          <div key={entry.key}>
            <span style={{ background: typeColors[entry.key] }} />
            <strong>{entry.label}</strong>
            <small>{entry.value.toLocaleString()} XP · {entry.known}/{entry.tracked} known</small>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TopKanjiBarChart({ items }: { items: TopKanji }) {
  if (items.length === 0) {
    return (
      <div className="analytics-empty">
        <strong>No kanji XP yet</strong>
        <span>Use OCR, tracker entries, or lookup actions to start collecting XP.</span>
      </div>
    );
  }

  const width = 720;
  const rowHeight = 46;
  const margin = { top: 20, right: 30, bottom: 20, left: 72 };
  const height = margin.top + margin.bottom + rowHeight * items.length;
  const maxXp = Math.max(1, ...items.map((item) => item.xp));
  const x = d3.scaleLinear([0, maxXp], [margin.left, width - margin.right]).nice();

  return (
    <div className="analytics-chart top-kanji-bars" role="img" aria-label="Most experienced kanji by XP">
      <svg viewBox={`0 0 ${width} ${height}`}>
        <rect className="analytics-frame" x="0" y="0" width={width} height={height} rx="12" />
        {items.map((item, index) => {
          const y = margin.top + index * rowHeight;
          const barWidth = Math.max(6, x(item.xp) - margin.left);
          return (
            <g key={item.itemKey}>
              <text className="kanji-rank-glyph" x={margin.left - 28} y={y + 29} textAnchor="middle">
                {item.itemKey}
              </text>
              <rect className={item.isKnown ? "kanji-xp-bar known" : "kanji-xp-bar"} x={margin.left} y={y + 8} width={barWidth} height="24" rx="8" />
              <text className="kanji-xp-label" x={margin.left + barWidth + 10} y={y + 26}>
                {item.xp.toLocaleString()} XP · {item.seenCount.toLocaleString()} seen
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
