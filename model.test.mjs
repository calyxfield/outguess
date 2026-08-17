import test from "node:test";
import assert from "node:assert/strict";
import { BinaryPredictor } from "./model.mjs";

test("starts at an honest 50/50 distribution", () => {
  const predictor = new BinaryPredictor();
  const distribution = predictor.predict();
  assert.equal(distribution.f, 0.5);
  assert.equal(distribution.d, 0.5);
  assert.equal(distribution.guess, null);
});

test("cross-entropy at 50/50 is exactly one bit", () => {
  const predictor = new BinaryPredictor();
  assert.equal(predictor.score("f", predictor.predict()).loss, 1);
  assert.equal(predictor.score("d", predictor.predict()).loss, 1);
});

test("prediction remains frozen until the choice is observed", () => {
  const predictor = new BinaryPredictor();
  const before = predictor.predict();
  predictor.score("f", before);
  assert.deepEqual(predictor.predict(), before);
});

test("learns a repeated F bias above chance", () => {
  const predictor = new BinaryPredictor();
  for (let index = 0; index < 12; index += 1) predictor.observe("f");
  const distribution = predictor.predict();
  assert.ok(distribution.f > 0.8, `Expected >80% F, got ${distribution.f}`);
  assert.equal(distribution.guess, "f");
});

test("learns an alternating sequence from context", () => {
  const predictor = new BinaryPredictor();
  for (const choice of "fdfdfdfdfdfdfdfd") predictor.observe(choice);
  const distribution = predictor.predict();
  assert.ok(distribution.f > 0.65, `Expected F after ...D, got ${distribution.f}`);
});

test("rejects anything except F or D", () => {
  const predictor = new BinaryPredictor();
  assert.throws(() => predictor.observe("x"), /F or D/);
});
