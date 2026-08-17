import test from "node:test";
import assert from "node:assert/strict";
import { AdaptivePredictor, isValidWord, normalizeWord } from "./model.mjs";

test("normalizes and validates one word", () => {
  assert.equal(normalizeWord("  Don’t  "), "don't");
  assert.equal(isValidWord("signal"), true);
  assert.equal(isValidWord("two words"), false);
  assert.equal(isValidWord("123"), false);
});

test("commits a deterministic prediction before observation", () => {
  const predictor = new AdaptivePredictor("The signal moves. The signal stops.");
  const first = predictor.predict();
  const again = predictor.predict();
  assert.equal(first.guess, again.guess);
  assert.deepEqual(first.top, again.top);
});

test("an exact prediction scores zero", () => {
  const predictor = new AdaptivePredictor();
  const locked = predictor.predict();
  const result = predictor.score(locked.guess, locked);
  assert.equal(result.exact, true);
  assert.equal(result.score, 0);
  assert.equal(result.label, "CAUGHT");
});

test("an unmodeled word earns a high evasion score", () => {
  const predictor = new AdaptivePredictor("The machine starts. The machine stops.");
  const locked = predictor.predict();
  const result = predictor.score("quasar", locked);
  assert.equal(result.exact, false);
  assert.ok(result.score >= 90);
});

test("the session model learns a repeated transition", () => {
  const predictor = new AdaptivePredictor("blue sky. blue water.");
  for (let index = 0; index < 6; index += 1) {
    predictor.observe("copper");
    predictor.observe("signal");
  }
  predictor.observe("copper");
  assert.equal(predictor.predict().guess, "signal");
});
