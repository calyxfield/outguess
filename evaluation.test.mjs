import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DEFAULT_PREDICTOR_CONFIG } from "./model.mjs";
import { POPULATION_PRIOR_METADATA } from "./population-prior.mjs";
import { configHash } from "./evaluation/evaluate.mjs";

const frozen = JSON.parse(
  await readFile(new URL("./evaluation/frozen-config.json", import.meta.url)),
);

test("production defaults equal the frozen evaluated configuration", () => {
  assert.deepEqual(DEFAULT_PREDICTOR_CONFIG, frozen.config);
  assert.equal(configHash(DEFAULT_PREDICTOR_CONFIG), frozen.configHash);
});

test("production population prior equals the frozen train-only artifact", () => {
  assert.equal(POPULATION_PRIOR_METADATA.partition, "train");
  assert.equal(POPULATION_PRIOR_METADATA.participants, 232);
  assert.equal(
    POPULATION_PRIOR_METADATA.packedCountsSha256,
    frozen.populationPrior.packedCountsSha256,
  );
});
