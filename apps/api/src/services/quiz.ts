export type QuizQuestion = {
  id: string;
  sourceType: string;
  sourceKey: string;
  prompt: string;
  expectedAnswer: string;
  promptType: string;
  frequency: number;
};

export function buildBalancedQuizDeck(groups: QuizQuestion[][], limit: number, seed: string) {
  const excluded = { missingAnswer: 0, selfAnswer: 0, duplicate: 0 };
  const seen = new Set<string>();
  const prepared = groups.map((group, groupIndex) => {
    const eligible = group.filter((question) => {
      const prompt = question.prompt.trim();
      const answer = question.expectedAnswer.trim();
      if (!answer) {
        excluded.missingAnswer += 1;
        return false;
      }
      if (normalize(prompt) === normalize(answer)) {
        excluded.selfAnswer += 1;
        return false;
      }
      const key = `${normalize(prompt)}\u0000${normalize(answer)}`;
      if (seen.has(key)) {
        excluded.duplicate += 1;
        return false;
      }
      seen.add(key);
      return true;
    });
    return seededShuffle(eligible, `${seed}:${groupIndex}`);
  });

  const questions: QuizQuestion[] = [];
  let cursor = 0;
  while (questions.length < limit && prepared.some((group) => cursor < group.length)) {
    for (const group of prepared) {
      if (questions.length >= limit) break;
      if (cursor < group.length) questions.push(group[cursor]);
    }
    cursor += 1;
  }
  return { questions, excluded, available: prepared.reduce((sum, group) => sum + group.length, 0) };
}

function seededShuffle<T>(items: T[], seed: string) {
  const output = [...items];
  let state = hash(seed) || 1;
  const random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  for (let index = output.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [output[index], output[target]] = [output[target], output[index]];
  }
  return output;
}

function hash(value: string) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function normalize(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}
