import assert from "node:assert/strict";
import test from "node:test";
import { detectGrammar, grammarConcepts } from "../src/services/grammar.js";

test("detects high-confidence N5 and N4 grammar with source context", () => {
  const text = "毎日、日本語を勉強しています。\n明日は早く起きなければならない。";
  const matches = detectGrammar(text);

  assert.deepEqual(matches.map((match) => match.id), ["te-iru", "nakereba-naranai"]);
  assert.equal(matches[0].matchedText, "ています");
  assert.equal(matches[0].sentence, "毎日、日本語を勉強しています。");
  assert.equal(matches[0].jlptLevel, "N5");
  assert.equal(matches[1].sentence, "明日は早く起きなければならない。");
  assert.equal(matches[1].confidence, 0.99);
});

test("keeps similar vocabulary and isolated particles out of grammar results", () => {
  assert.deepEqual(detectGrammar("日本語という言葉です。私は東京にいます。"), []);
  assert.deepEqual(detectGrammar("ので のに ても そう"), []);
});

test("detects distinct patterns without duplicating a match", () => {
  const matches = detectGrammar("ここで写真を撮ってください。撮らないでください。");

  assert.deepEqual(matches.map((match) => match.id), ["te-kudasai", "nai-de-kudasai"]);
  assert.equal(new Set(matches.map((match) => match.matchId)).size, matches.length);
  assert.ok(grammarConcepts.length >= 20);
});

test("maps grammar evidence to OCR boxes and adjusts confidence", () => {
  const matches = detectGrammar("日本語を勉強しています", [
    {
      text: "日本語を勉強しています",
      confidence: 0.8,
      detection_index: 0,
      bbox: { x: 10, y: 20, width: 180, height: 30 }
    }
  ]);

  assert.equal(matches.length, 1);
  assert.deepEqual(matches[0].bbox, { x: 10, y: 20, width: 180, height: 30 });
  assert.equal(matches[0].confidence, 0.91);
});

test("does not report matches for blank OCR output", () => {
  assert.deepEqual(detectGrammar(" \n "), []);
});
