import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { BinaryPredictor } from "../model.mjs";
import {
  POPULATION_PRIOR,
  POPULATION_PRIOR_METADATA,
} from "../population-prior.mjs";
import {
  configHash,
  evaluateSequence,
  neutralPredictor,
  readRecords,
} from "./evaluate.mjs";
import { LegacyBinaryPredictor } from "./legacy-model.mjs";

const HERE = new URL("./", import.meta.url);
const INPUTS = Object.freeze({
  random: Object.freeze({
    url: "https://osf.io/download/64f4d2a3152ffd022fce1553/",
    sha256: "48d0506420d66d5a2f5c3043065882b3e7482622cc5c7e314a6331a3e63f6195",
  }),
  workingMemory: Object.freeze({
    url: "https://osf.io/download/64f4d2a3152ffd022fce1555/",
    sha256: "86e88173ff6f86d354b82995cde8e5ecc4171f51ab1f7a193d20a70db68892ba",
  }),
});
const EXPECTED_CANONICAL = Object.freeze({
  participants: 142,
  observations: 14200,
  bytes: 424864,
  sha256: "985dd0efb718c8403735658ff196141cb7a9cff62ced0160255496ad60924f40",
});

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function loadBytes(path, remote) {
  let bytes;
  if (path) {
    bytes = await readFile(path);
  } else {
    const response = await fetch(remote.url);
    if (!response.ok) throw new Error(`Could not download ${remote.url}: HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
  }
  const actual = sha256(bytes);
  if (actual !== remote.sha256) {
    throw new Error(`Input SHA-256 mismatch: expected ${remote.sha256}, got ${actual}`);
  }
  return bytes;
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--random") options.random = argv[++index];
    else if (argv[index] === "--working-memory") options.workingMemory = argv[++index];
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  return options;
}

function prepareParticipants(randomText, workingMemoryText) {
  const eligible = new Set(
    readRecords(workingMemoryText)
      .filter(
        (row) =>
          Number(row.correct_digits) > 0.85 &&
          Number(row.partial_correct_complex) > 3 &&
          Number(row.partial_correct_complex) < 11,
      )
      .map((row) => String(row.id)),
  );
  const grouped = new Map();
  for (const row of readRecords(randomText)) {
    const id = String(row.id);
    if (!eligible.has(id) || !["0", "1"].includes(String(row.key))) continue;
    if (!grouped.has(id)) grouped.set(id, []);
    grouped.get(id).push(row);
  }

  const participants = [...grouped]
    .filter(([, rows]) => rows.length >= 100)
    .sort(([left], [right]) => left.localeCompare(right, "en", { numeric: true }))
    .map(([id, rows]) => {
      rows.sort((left, right) => Number(left.ids) - Number(right.ids));
      const first100 = rows.slice(0, 100);
      return {
        id,
        rows: first100,
        sequence: first100.map((row) => (Number(row.key) === 1 ? "f" : "d")),
      };
    });
  const canonical = participants
    .flatMap(({ rows }) => rows.map((row) => `${row.id},${row.ids},${row.key}\n`))
    .join("");
  const observed = {
    participants: participants.length,
    observations: participants.reduce((sum, item) => sum + item.rows.length, 0),
    bytes: Buffer.byteLength(canonical),
    sha256: sha256(canonical),
  };
  for (const key of Object.keys(EXPECTED_CANONICAL)) {
    if (observed[key] !== EXPECTED_CANONICAL[key]) {
      throw new Error(
        `Canonical external cohort ${key} mismatch: expected ${EXPECTED_CANONICAL[key]}, got ${observed[key]}`,
      );
    }
  }
  return { participants, canonical: observed };
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function evaluate(participants, createPredictor) {
  const rows = participants.map(({ sequence }) => evaluateSequence(sequence, createPredictor));
  return {
    participants: rows.length,
    bitsPerChoice: average(rows.map((row) => row.bitsPerChoice)),
    accuracy: average(rows.map((row) => row.accuracy)),
  };
}

export async function runExternalEvaluation(options = {}) {
  const [randomBytes, workingMemoryBytes, frozenBytes] = await Promise.all([
    loadBytes(options.random, INPUTS.random),
    loadBytes(options.workingMemory, INPUTS.workingMemory),
    readFile(new URL("frozen-config.json", HERE)),
  ]);
  const frozen = JSON.parse(frozenBytes);
  if (configHash(frozen.config) !== frozen.configHash) {
    throw new Error("Frozen configuration hash does not match its contents");
  }
  if (frozen.populationPrior.packedCountsSha256 !== POPULATION_PRIOR_METADATA.packedCountsSha256) {
    throw new Error("Shipped population prior does not match the frozen artifact hash");
  }
  const { participants, canonical } = prepareParticipants(
    randomBytes.toString("utf8"),
    workingMemoryBytes.toString("utf8"),
  );
  return {
    source: "Biesaga and Nowak (2024), OSF ck78n Study 2",
    qualification:
      "Untouched external cohort; task differs from Outguess (imagined fair coin, comma/dot keys, seven previous choices visible, timed).",
    inputSha256: {
      random: sha256(randomBytes),
      workingMemory: sha256(workingMemoryBytes),
    },
    canonical,
    configHash: frozen.configHash,
    models: {
      neutral: evaluate(participants, neutralPredictor),
      legacy: evaluate(participants, () => new LegacyBinaryPredictor()),
      improved: evaluate(participants, () => new BinaryPredictor(frozen.config)),
      improvedPopulation: evaluate(
        participants,
        () => new BinaryPredictor({ ...frozen.config, populationPrior: POPULATION_PRIOR }),
      ),
    },
  };
}

const invokedDirectly =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) {
  const result = await runExternalEvaluation(parseArguments(process.argv.slice(2)));
  console.log(JSON.stringify(result, null, 2));
}
