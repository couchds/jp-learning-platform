import * as d3 from "d3";
import type { KnowledgeSummary } from "./types";

type HistoryPoint = KnowledgeSummary["kanjiXpHistory"][number];
type Totals = KnowledgeSummary["totals"];
type TopKanji = KnowledgeSummary["topKanji"];
type SourceBreakdown = KnowledgeSummary["eventSourceBreakdown"];
type KanjiNetwork = KnowledgeSummary["kanjiNetwork"];
type CompositionKey = "kanji" | "words" | "customVocabulary";
type ItemType = "kanji" | "word" | "custom_vocabulary";
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

const itemTypeColors: Record<ItemType, string> = {
  kanji: "#078f90",
  word: "#ffc857",
  custom_vocabulary: "#ff8b5f"
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

export function EventSourceBars({ items }: { items: SourceBreakdown }) {
  if (items.length === 0) {
    return (
      <div className="analytics-empty compact">
        <strong>No source activity yet</strong>
        <span>XP source analytics appear as OCR, lookups, and tracker actions create events.</span>
      </div>
    );
  }

  const width = 640;
  const rowHeight = 42;
  const margin = { top: 18, right: 42, bottom: 20, left: 132 };
  const height = margin.top + margin.bottom + rowHeight * items.length;
  const maxXp = Math.max(1, ...items.map((item) => item.xp));
  const x = d3.scaleLinear([0, maxXp], [margin.left, width - margin.right]).nice();

  return (
    <div className="analytics-chart source-bars" role="img" aria-label="Knowledge XP by event source">
      <svg viewBox={`0 0 ${width} ${height}`}>
        <rect className="analytics-frame" x="0" y="0" width={width} height={height} rx="12" />
        {items.map((item, index) => {
          const y = margin.top + index * rowHeight;
          const barWidth = Math.max(7, x(item.xp) - margin.left);
          return (
            <g key={`${item.source}-${item.itemType}`}>
              <text className="source-label" x={margin.left - 14} y={y + 25} textAnchor="end">
                {sourceLabel(item.source)}
              </text>
              <rect
                className="source-bar"
                x={margin.left}
                y={y + 8}
                width={barWidth}
                height="22"
                rx="8"
                fill={itemTypeColors[item.itemType]}
              >
                <title>{`${sourceLabel(item.source)} ${item.itemType}: ${item.xp} XP, ${item.events} events`}</title>
              </rect>
              <text className="source-value" x={margin.left + barWidth + 9} y={y + 24}>
                {item.xp.toLocaleString()} XP · {item.events}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function KanjiKnowledgeNetwork({ network }: { network: KanjiNetwork }) {
  if (network.nodes.length === 0) {
    return (
      <div className="analytics-empty">
        <strong>No tracked kanji network yet</strong>
        <span>Mark kanji as seen or known, then this map will connect them through radicals, readings, and meanings.</span>
      </div>
    );
  }

  const width = 920;
  const height = 440;
  const center = { x: width / 2, y: height / 2 };
  const maxXp = Math.max(1, ...network.nodes.map((node) => node.xp));
  const radius = d3.scaleSqrt([0, maxXp], [18, 42]);
  const scoreWidth = d3.scaleLinear([0, Math.max(1, ...network.links.map((link) => link.score))], [1.4, 5.5]);
  const nodes = network.nodes.map((node, index) => {
    const angle = (index / Math.max(1, network.nodes.length)) * Math.PI * 2;
    const ring = node.status === "related" ? 172 : 96;
    return {
      ...node,
      x: center.x + Math.cos(angle) * ring,
      y: center.y + Math.sin(angle) * ring
    };
  });
  const nodeById = new Map(nodes.map((node) => [node.literal, node]));
  const links = network.links
    .map((link) => ({
      ...link,
      sourceNode: nodeById.get(link.source),
      targetNode: nodeById.get(link.target)
    }))
    .filter((link): link is typeof link & { sourceNode: NonNullable<typeof link.sourceNode>; targetNode: NonNullable<typeof link.targetNode> } =>
      Boolean(link.sourceNode && link.targetNode)
    );
  const simulationNodes = nodes.map((node) => ({ ...node }));
  const simulationNodeById = new Map(simulationNodes.map((node) => [node.literal, node]));
  const simulationLinks = links.map((link) => ({
    source: simulationNodeById.get(link.source) ?? link.source,
    target: simulationNodeById.get(link.target) ?? link.target,
    score: link.score
  }));

  d3.forceSimulation(simulationNodes)
    .force("link", d3.forceLink(simulationLinks).id((node) => (node as { literal: string }).literal).distance((link) => 142 - Math.min(80, Number((link as { score: number }).score))))
    .force("charge", d3.forceManyBody().strength(-230))
    .force("center", d3.forceCenter(center.x, center.y))
    .force("collide", d3.forceCollide((node) => radius((node as { xp: number }).xp) + 10))
    .stop()
    .tick(180);

  const positioned = simulationNodes.map((node) => ({
    ...node,
    x: clamp(Number(node.x), 58, width - 58),
    y: clamp(Number(node.y), 58, height - 58)
  }));
  const positionedById = new Map(positioned.map((node) => [node.literal, node]));

  return (
    <div className="analytics-chart knowledge-network" role="img" aria-label="Kanji knowledge relationship network">
      <svg viewBox={`0 0 ${width} ${height}`}>
        <rect className="analytics-frame" x="0" y="0" width={width} height={height} rx="12" />
        {links.map((link) => {
          const source = positionedById.get(link.source);
          const target = positionedById.get(link.target);
          if (!source || !target) {
            return null;
          }
          return (
            <line
              className="knowledge-network-link"
              key={`${link.source}-${link.target}-${link.relationType}`}
              x1={source.x}
              y1={source.y}
              x2={target.x}
              y2={target.y}
              strokeWidth={scoreWidth(link.score)}
            >
              <title>{`${link.source} -> ${link.target}: ${link.relationType}, score ${link.score}`}</title>
            </line>
          );
        })}
        {positioned.map((node) => (
          <g className={`knowledge-network-node ${node.status}`} key={node.literal}>
            <circle cx={node.x} cy={node.y} r={radius(node.xp)} />
            <text x={node.x} y={node.y + 10} textAnchor="middle">
              {node.literal}
            </text>
            <title>{`${node.literal}: ${node.status}, ${node.xp} XP${node.meanings.length > 0 ? `, ${node.meanings.slice(0, 3).join(", ")}` : ""}`}</title>
          </g>
        ))}
      </svg>
      <div className="network-legend">
        <span><i className="known" /> Known</span>
        <span><i className="learning" /> Learning</span>
        <span><i className="related" /> Related</span>
      </div>
    </div>
  );
}

function sourceLabel(source: string) {
  return source
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ") || "Unknown";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
