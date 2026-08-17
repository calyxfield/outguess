import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  BinaryPredictor,
  DEFAULT_PREDICTOR_CONFIG,
  buildPopulationPrior,
} from "../model.mjs";
import { LegacyBinaryPredictor } from "./legacy-model.mjs";

const HERE = new URL("./", import.meta.url);
const MANIFEST_URL = new URL("split-manifest.json", HERE);
const FROZEN_URL = new URL("frozen-config.json", HERE);
const DEFAULT_DATA = "/tmp/human-binary-dat.csv";

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function configHash(config) {
  return createHash("sha256").update(canonicalJson(config)).digest("hex");
}

function parseArguments(argv) {
  const options = {
    data: DEFAULT_DATA,
    partition: "validation",
    overrides: {},
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--data") options.data = argv[++index];
    else if (argument === "--partition") options.partition = argv[++index];
    else if (argument === "--set") {
      const [key, rawValue] = argv[++index].split("=");
      if (!(key in DEFAULT_PREDICTOR_CONFIG)) throw new Error(`Unknown config key: ${key}`);
      const value = Number(rawValue);
      if (!Number.isFinite(value)) throw new Error(`Config value must be numeric: ${rawValue}`);
      options.overrides[key] = value;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (!["train", "validation", "test"].includes(options.partition)) {
    throw new Error(`Unknown partition: ${options.partition}`);
  }
  return options;
}

function splitCsvLine(line) {
  const fields = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      fields.push(field);
      field = "";
    } else {
      field += character;
    }
  }
  fields.push(field);
  return fields;
}

export function readRecords(text) {
  const [headerLine, ...lines] = text.trim().split(/\r?\n/);
  const headers = splitCsvLine(headerLine);
  return lines.map((line) =>
    Object.fromEntries(
      splitCsvLine(line).map((value, index) => [headers[index], value]),
    ),
  );
}

export function parseZ8rjx(text) {
  const participants = new Map();
  for (const record of readRecords(text)) {
    const id = String(record.subject);
    const choice = Number(record.choice) === 1 ? "f" : "d";
    const trial = Number(record.trial);
    const condition = Number(record.condition);
    if (!participants.has(id)) participants.set(id, { id, condition, trials: [] });
    const participant = participants.get(id);
    if (participant.condition !== condition) throw new Error(`Condition changed for ${id}`);
    participant.trials.push({ trial, choice });
  }

  for (const participant of participants.values()) {
    participant.trials.sort((left, right) => left.trial - right.trial);
    participant.sequence = participant.trials.map(({ choice }) => choice);
    if (participant.sequence.length !== 1000) {
      throw new Error(`Expected 1,000 choices for ${participant.id}`);
    }
  }
  return participants;
}

function validateManifest(manifest, participants) {
  const assigned = new Set();
  for (const partition of ["train", "validation", "test"]) {
    for (const id of manifest[partition]) {
      if (assigned.has(id)) throw new Error(`Participant ${id} occurs in multiple partitions`);
      if (!participants.has(id)) throw new Error(`Participant ${id} is absent from the data`);
      assigned.add(id);
    }
  }
  if (assigned.size !== participants.size) {
    throw new Error(`Manifest covers ${assigned.size} of ${participants.size} participants`);
  }
  if (manifest.test.length / participants.size < 0.2) {
    throw new Error("Test partition must reserve at least 20% of participants");
  }
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function evaluateSequence(sequence, createPredictor) {
  const predictor = createPredictor();
  let loss = 0;
  let correct = 0;
  for (const choice of sequence.slice(0, 100)) {
    const distribution = predictor.predict();
    const probability = distribution[choice];
    loss += -Math.log2(probability);
    correct +=
      distribution.guess === null ? 0.5 : Number(distribution.guess === choice);
    predictor.observe(choice);
  }
  return { bitsPerChoice: loss / 100, accuracy: correct / 100 };
}

export function evaluateParticipants(participants, ids, createPredictor) {
  const rows = ids.map((id) => {
    const participant = participants.get(id);
    return {
      id,
      condition: participant.condition,
      ...evaluateSequence(participant.sequence, createPredictor),
    };
  });
  const summarize = (group) => ({
    participants: group.length,
    bitsPerChoice: average(group.map(({ bitsPerChoice }) => bitsPerChoice)),
    accuracy: average(group.map(({ accuracy }) => accuracy)),
  });
  return {
    all: summarize(rows),
    byCondition: Object.fromEntries(
      [...new Set(rows.map(({ condition }) => condition))]
        .sort((left, right) => left - right)
        .map((condition) => [
          condition,
          summarize(rows.filter((row) => row.condition === condition)),
        ]),
    ),
  };
}

export function neutralPredictor() {
  return {
    predict: () => ({ f: 0.5, d: 0.5, guess: null }),
    observe: () => {},
  };
}

async function loadFrozenConfig() {
  try {
    return JSON.parse(await readFile(FROZEN_URL, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export async function runEvaluation(options) {
  const manifest = JSON.parse(await readFile(MANIFEST_URL, "utf8"));
  const participants = parseZ8rjx(await readFile(options.data, "utf8"));
  validateManifest(manifest, participants);

  let config = {
    ...DEFAULT_PREDICTOR_CONFIG,
    ...options.overrides,
    expertPrior: {
      ...DEFAULT_PREDICTOR_CONFIG.expertPrior,
      ...(options.overrides.expertPrior ?? {}),
    },
  };
  if (options.partition === "test") {
    const frozen = await loadFrozenConfig();
    if (!frozen) throw new Error("Test access is locked until frozen-config.json is committed");
    if (Object.keys(options.overrides).length > 0) {
      throw new Error("Config overrides are forbidden for the frozen test partition");
    }
    config = frozen.config;
    if (configHash(config) !== frozen.configHash) {
      throw new Error("Frozen configuration hash does not match its contents");
    }
  }

  const trainingSequences = manifest.train.map(
    (id) => participants.get(id).sequence,
  );
  const populationPrior = buildPopulationPrior(
    trainingSequences,
    config.maxContext,
  );
  const ids = manifest[options.partition];

  return {
    source: "OSF z8rjx",
    qualification:
      "The full cohort was aggregate-inspected before this split existed; test is not pristine.",
    partition: options.partition,
    config,
    configHash: configHash(config),
    models: {
      neutral: evaluateParticipants(participants, ids, neutralPredictor),
      legacy: evaluateParticipants(participants, ids, () => new LegacyBinaryPredictor()),
      improved: evaluateParticipants(participants, ids, () => new BinaryPredictor(config)),
      improvedPopulation: evaluateParticipants(
        participants,
        ids,
        () => new BinaryPredictor({ ...config, populationPrior }),
      ),
    },
  };
}

const invokedDirectly =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) {
  const result = await runEvaluation(parseArguments(process.argv.slice(2)));
  console.log(JSON.stringify(result, null, 2));
}
