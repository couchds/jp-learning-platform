export type GrammarLevel = "N5" | "N4";

export type GrammarBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type GrammarConcept = {
  id: string;
  title: string;
  pattern: string;
  explanation: string;
  jlptLevel: GrammarLevel;
  confidence: number;
};

export type GrammarMatch = GrammarConcept & {
  matchId: string;
  matchedText: string;
  sentence: string;
  start: number;
  end: number;
  confidence: number;
  bbox?: GrammarBox;
};

type GrammarRule = GrammarConcept & {
  expression: RegExp;
};

type OcrElement = {
  text?: unknown;
  confidence?: unknown;
  detection_index?: unknown;
  detectionIndex?: unknown;
  bbox?: unknown;
};

const rules: GrammarRule[] = [
  {
    id: "te-iru",
    title: "Ongoing action or state",
    pattern: "-te iru / -de iru",
    explanation: "Describes an action in progress or a state that continues from an earlier action.",
    jlptLevel: "N5",
    confidence: 0.96,
    expression: /(?:て|で)い(?:る|ます|た|ました|ない|ません)/gu
  },
  {
    id: "te-kudasai",
    title: "Polite request",
    pattern: "-te kudasai / -de kudasai",
    explanation: "Politely asks someone to do an action.",
    jlptLevel: "N5",
    confidence: 0.98,
    expression: /(?:て|で)ください/gu
  },
  {
    id: "nai-de-kudasai",
    title: "Polite negative request",
    pattern: "-nai de kudasai",
    explanation: "Politely asks someone not to do an action.",
    jlptLevel: "N5",
    confidence: 0.99,
    expression: /ないでください/gu
  },
  {
    id: "te-mo-ii",
    title: "Permission",
    pattern: "-te mo ii",
    explanation: "Says that an action is allowed or asks whether it is permitted.",
    jlptLevel: "N5",
    confidence: 0.97,
    expression: /(?:て|で)も(?:いい|よい)(?:です)?/gu
  },
  {
    id: "te-wa-ikenai",
    title: "Prohibition",
    pattern: "-te wa ikenai",
    explanation: "Says that an action is not allowed or should not be done.",
    jlptLevel: "N5",
    confidence: 0.98,
    expression: /(?:ては|では)(?:いけない|いけません|だめ(?:です)?)/gu
  },
  {
    id: "nakereba-naranai",
    title: "Obligation",
    pattern: "-nakereba naranai",
    explanation: "Expresses that an action must be done.",
    jlptLevel: "N4",
    confidence: 0.99,
    expression: /(?:(?:なければ|なくては)(?:ならない|なりません|いけない|いけません)|なきゃ(?:ならない|いけない))/gu
  },
  {
    id: "ta-koto-ga-aru",
    title: "Past experience",
    pattern: "-ta koto ga aru",
    explanation: "Says whether someone has had a particular experience before.",
    jlptLevel: "N5",
    confidence: 0.97,
    expression: /(?:た|だ)ことが(?:ある|あります|ない|ありません)/gu
  },
  {
    id: "koto-ga-dekiru",
    title: "Ability",
    pattern: "koto ga dekiru",
    explanation: "Expresses that someone can or cannot do an action.",
    jlptLevel: "N5",
    confidence: 0.98,
    expression: /ことが(?:できる|できます|できない|できません)/gu
  },
  {
    id: "you-ni-naru",
    title: "Change in ability or habit",
    pattern: "you ni naru",
    explanation: "Describes a gradual change in ability, state, or regular behavior.",
    jlptLevel: "N4",
    confidence: 0.96,
    expression: /ようにな(?:る|ります|った|りました)/gu
  },
  {
    id: "you-ni-suru",
    title: "Make an effort or habit",
    pattern: "you ni suru",
    explanation: "Expresses a deliberate effort to make something happen or become a habit.",
    jlptLevel: "N4",
    confidence: 0.96,
    expression: /ように(?:する|します|している|しています)/gu
  },
  {
    id: "to-omou",
    title: "Thought or opinion",
    pattern: "to omou",
    explanation: "Marks the content of a thought, opinion, or intention.",
    jlptLevel: "N4",
    confidence: 0.96,
    expression: /と思(?:う|います|った|いました|っている|っています)/gu
  },
  {
    id: "kamoshirenai",
    title: "Possibility",
    pattern: "kamoshirenai",
    explanation: "Expresses that something may be true or may happen.",
    jlptLevel: "N4",
    confidence: 0.99,
    expression: /かもしれ(?:ない|ません)/gu
  },
  {
    id: "tsumori",
    title: "Intention or plan",
    pattern: "tsumori da",
    explanation: "Expresses a plan or intention to do, or not do, something.",
    jlptLevel: "N4",
    confidence: 0.92,
    expression: /つもり(?:だ|です|だった|でした)?/gu
  },
  {
    id: "hazu",
    title: "Expected outcome",
    pattern: "hazu da",
    explanation: "Expresses a strong expectation based on what the speaker knows.",
    jlptLevel: "N4",
    confidence: 0.9,
    expression: /はず(?:だ|です|だった|でした)/gu
  },
  {
    id: "te-shimau",
    title: "Completion or regret",
    pattern: "-te shimau / -de shimau",
    explanation: "Marks an action as completely finished, often with regret or surprise.",
    jlptLevel: "N4",
    confidence: 0.96,
    expression: /(?:て|で)しま(?:う|います|った|いました)/gu
  },
  {
    id: "te-miru",
    title: "Try doing",
    pattern: "-te miru / -de miru",
    explanation: "Expresses trying an action to see what happens.",
    jlptLevel: "N4",
    confidence: 0.94,
    expression: /(?:て|で)み(?:る|ます|た|ました)/gu
  },
  {
    id: "tari-tari-suru",
    title: "Non-exhaustive actions",
    pattern: "-tari ... -tari suru",
    explanation: "Lists representative actions without implying that the list is complete.",
    jlptLevel: "N5",
    confidence: 0.98,
    expression: /(?:たり|だり)[^。！？!?\n]{1,32}(?:たり|だり)(?:する|します|した|しました)/gu
  },
  {
    id: "hou-ga-ii",
    title: "Advice",
    pattern: "hou ga ii",
    explanation: "Gives advice about what is better to do or not do.",
    jlptLevel: "N4",
    confidence: 0.94,
    expression: /ほうが(?:いい|よい)(?:です)?/gu
  },
  {
    id: "koto-ni-suru",
    title: "Personal decision",
    pattern: "koto ni suru",
    explanation: "Expresses a decision made by the speaker.",
    jlptLevel: "N4",
    confidence: 0.97,
    expression: /ことに(?:する|します|した|しました)/gu
  },
  {
    id: "koto-ni-naru",
    title: "Decision or arrangement",
    pattern: "koto ni naru",
    explanation: "Expresses a decision, rule, or arrangement determined by circumstances or others.",
    jlptLevel: "N4",
    confidence: 0.97,
    expression: /ことにな(?:る|ります|った|りました)/gu
  }
];

export const grammarConcepts: GrammarConcept[] = rules.map(({ expression: _expression, ...concept }) => concept);

export function detectGrammar(rawText: string, rawElements: unknown[] = []): GrammarMatch[] {
  if (!rawText.trim()) {
    return [];
  }

  const elements = rawElements.filter(isOcrElement);
  const matches: GrammarMatch[] = [];

  for (const rule of rules) {
    rule.expression.lastIndex = 0;
    for (const result of rawText.matchAll(rule.expression)) {
      const start = result.index;
      const matchedText = result[0];
      if (start === undefined || !matchedText) {
        continue;
      }

      const end = start + matchedText.length;
      const evidence = findBoxEvidence(rawText, start, end, elements);
      const confidence = roundConfidence(
        evidence.confidence === undefined
          ? rule.confidence
          : rule.confidence * (0.75 + evidence.confidence * 0.25)
      );

      matches.push({
        ...withoutExpression(rule),
        matchId: `${rule.id}:${start}:${end}`,
        matchedText,
        sentence: sentenceForRange(rawText, start, end),
        start,
        end,
        confidence,
        ...(evidence.bbox ? { bbox: evidence.bbox } : {})
      });
    }
  }

  const specificMatches = matches.filter((candidate) => !matches.some((other) =>
    other.matchId !== candidate.matchId
      && other.start <= candidate.start
      && other.end >= candidate.end
      && other.end - other.start > candidate.end - candidate.start
      && other.confidence >= candidate.confidence
  ));
  const unique = new Map<string, GrammarMatch>();
  for (const match of specificMatches) {
    unique.set(match.matchId, match);
  }
  return [...unique.values()].sort((left, right) => left.start - right.start || right.end - left.end);
}

export function findGrammarConcept(id: string) {
  return grammarConcepts.find((concept) => concept.id === id);
}

function withoutExpression({ expression: _expression, ...concept }: GrammarRule): GrammarConcept {
  return concept;
}

function sentenceForRange(text: string, start: number, end: number) {
  let sentenceStart = start;
  while (sentenceStart > 0 && !isSentenceBoundary(text[sentenceStart - 1])) {
    sentenceStart -= 1;
  }

  let sentenceEnd = end;
  while (sentenceEnd < text.length && !isSentenceBoundary(text[sentenceEnd])) {
    sentenceEnd += 1;
  }
  if (sentenceEnd < text.length && text[sentenceEnd] !== "\n") {
    sentenceEnd += 1;
  }

  return text.slice(sentenceStart, sentenceEnd).trim();
}

function isSentenceBoundary(character: string | undefined) {
  return character === "。" || character === "！" || character === "？" || character === "!" || character === "?" || character === "\n";
}

function findBoxEvidence(text: string, start: number, end: number, elements: OcrElement[]) {
  const line = lineRangeAt(text, start);
  const candidates = elements
    .filter((element) => detectionIndex(element) === line.index)
    .map((element) => ({
      text: typeof element.text === "string" ? element.text : "",
      confidence: numericConfidence(element.confidence),
      bbox: parseBox(element.bbox)
    }))
    .filter((element) => element.text && element.bbox);

  if (candidates.length === 0) {
    return {};
  }

  const localStart = start - line.start;
  const localEnd = end - line.start;
  let cursor = 0;
  const overlapping = candidates.filter((candidate) => {
    const tokenStart = line.text.indexOf(candidate.text, cursor);
    if (tokenStart < 0) {
      return candidate.text.includes(text.slice(start, end));
    }
    cursor = tokenStart + candidate.text.length;
    return tokenStart < localEnd && cursor > localStart;
  });
  const selected = overlapping.length > 0 ? overlapping : candidates;
  const boxes = selected.map((element) => element.bbox).filter((box): box is GrammarBox => Boolean(box));
  if (boxes.length === 0) {
    return {};
  }

  const confidences = selected
    .map((element) => element.confidence)
    .filter((confidence): confidence is number => confidence !== undefined);
  return {
    bbox: unionBoxes(boxes),
    confidence: confidences.length > 0
      ? confidences.reduce((sum, confidence) => sum + confidence, 0) / confidences.length
      : undefined
  };
}

function lineRangeAt(text: string, position: number) {
  const start = text.lastIndexOf("\n", Math.max(0, position - 1)) + 1;
  const nextBreak = text.indexOf("\n", position);
  return {
    index: text.slice(0, start).split("\n").length - 1,
    start,
    text: text.slice(start, nextBreak < 0 ? text.length : nextBreak)
  };
}

function detectionIndex(element: OcrElement) {
  const value = element.detection_index ?? element.detectionIndex;
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function numericConfidence(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return Math.max(0, Math.min(1, value));
}

function parseBox(value: unknown): GrammarBox | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const box = value as Record<string, unknown>;
  const x = Number(box.x);
  const y = Number(box.y);
  const width = Number(box.width);
  const height = Number(box.height);
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    return undefined;
  }
  return { x, y, width, height };
}

function unionBoxes(boxes: GrammarBox[]): GrammarBox {
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function roundConfidence(value: number) {
  return Math.round(Math.max(0, Math.min(1, value)) * 100) / 100;
}

function isOcrElement(value: unknown): value is OcrElement {
  return Boolean(value && typeof value === "object");
}
