import assert from "node:assert/strict";
import test from "node:test";
import { buildBalancedQuizDeck, type QuizQuestion } from "../src/services/quiz.js";

function question(id: string, sourceType: string, prompt = id, expectedAnswer = `${id}-answer`): QuizQuestion {
  return { id, sourceType, sourceKey: prompt, prompt, expectedAnswer, promptType: sourceType, frequency: 1 };
}

test("quiz decks are deterministic, balanced, and exclude invalid questions", () => {
  const groups = [
    [question("term-1", "kanji"), question("self", "word", "same", "same"), question("missing", "word", "missing", ""), question("term-2", "word")],
    [question("dictionary-1", "word"), question("dictionary-2", "word")],
    [question("custom-1", "custom_vocabulary"), question("duplicate", "custom_vocabulary", "term-1", "term-1-answer")]
  ];
  const first = buildBalancedQuizDeck(groups, 3, "resource:today");
  const second = buildBalancedQuizDeck(groups, 3, "resource:today");
  assert.deepEqual(first, second);
  assert.equal(first.questions.length, 3);
  assert.deepEqual(new Set(first.questions.map((item) => item.sourceType)), new Set(["kanji", "word", "custom_vocabulary"]));
  assert.equal(first.excluded.selfAnswer, 1);
  assert.equal(first.excluded.missingAnswer, 1);
  assert.equal(first.excluded.duplicate, 1);
  assert.ok(first.questions.some((item) => item.id.startsWith("dictionary")));
  assert.ok(first.questions.some((item) => item.id.startsWith("custom")));
});
