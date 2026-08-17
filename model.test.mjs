import test from "node:test";
import assert from "node:assert/strict";
import { BinaryPredictor } from "./model.mjs";
import { POPULATION_PRIOR } from "./population-prior.mjs";

function evaluate(sequence, options = {}) {
  const predictor = new BinaryPredictor(options);
  let loss = 0;
  for (const choice of sequence) {
    const distribution = predictor.predict();
    loss += predictor.score(choice, distribution).loss;
    predictor.observe(choice);
  }
  return loss / sequence.length;
}

function seededChoices(length, probabilityF, initialSeed = 123456789) {
  let seed = initialSeed;
  return Array.from({ length }, () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 2 ** 32 < probabilityF ? "f" : "d";
  });
}

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

test("synthetic fair choices stay near one bit", () => {
  const loss = evaluate(seededChoices(100, 0.5), { populationPrior: POPULATION_PRIOR });
  assert.ok(loss > 0.9 && loss < 1.1, `Expected near one bit, got ${loss}`);
});

test("synthetic bias, motif, and regime switch are learnable", () => {
  const options = { populationPrior: POPULATION_PRIOR };
  const biased = seededChoices(100, 0.8);
  const alternating = Array.from({ length: 100 }, (_, index) => (index % 2 ? "d" : "f"));
  const motif = Array.from({ length: 100 }, (_, index) => "ffdffddd"[index % 8]);
  const switchRegime = [..."f".repeat(50), ..."d".repeat(50)];
  assert.ok(evaluate(biased, options) < 0.9);
  assert.ok(evaluate(alternating, options) < 0.3);
  assert.ok(evaluate(motif, options) < 0.55);
  assert.ok(evaluate(switchRegime, options) < 0.5);
});

test("reactive anti-prediction does not make the model catastrophically confident", () => {
  const predictor = new BinaryPredictor({ populationPrior: POPULATION_PRIOR });
  let loss = 0;
  for (let index = 0; index < 100; index += 1) {
    const distribution = predictor.predict();
    const choice = distribution.guess === "f" ? "d" : "f";
    loss += predictor.score(choice, distribution).loss;
    predictor.observe(choice);
  }
  assert.ok(loss / 100 < 1.2, `Anti-prediction loss was ${loss / 100}`);
});

test("predictions are invariant to swapping F and D labels", () => {
  const original = new BinaryPredictor({ populationPrior: POPULATION_PRIOR });
  const mirrored = new BinaryPredictor({ populationPrior: POPULATION_PRIOR });
  for (const choice of "ffdfddffdffdf") {
    original.observe(choice);
    mirrored.observe(choice === "f" ? "d" : "f");
    assert.ok(Math.abs(original.predict().f - mirrored.predict().d) < 1e-12);
  }
});

test("rejects anything except F or D", () => {
  const predictor = new BinaryPredictor();
  assert.throws(() => predictor.observe("x"), /F or D/);
});
