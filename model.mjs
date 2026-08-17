const START = "<start>";
const JOIN = "\u0001";

export const SEED_TEXT = `
The morning begins with a quiet room and a cup of coffee. The office lights turn on before the first train arrives. A clear plan makes difficult work feel possible. The next step is usually smaller than the whole problem.
I think the answer depends on what we can observe. I want to know why the machine behaved that way. We should test the simplest version before adding more parts. A good explanation shows what changes and what stays fixed.
People write stories because a sequence creates expectation. The reader follows a sentence and predicts what might come next. A surprising word can still feel inevitable after it appears. Good prose balances pattern with interruption.
The system receives an input and produces an output. Every measurement should have a unit and every claim should have a test. If the result changes, record the conditions that changed with it. Reliable tools make their internal state visible.
You can walk through the city after the rain. The street reflects the windows and the traffic moves slowly. Someone opens a door and music reaches the pavement. Another person waits beneath the awning with a folded newspaper.
We are trying to build something useful together. The first prototype should reveal the main decision quickly. Later versions can become larger if the small loop remains interesting. Features that do not strengthen the loop can wait.
There is a difference between being random and being hard to predict. Human choices repeat habits even when people try to avoid them. A model can learn those habits from a short sequence. The model becomes a better opponent as the session continues.
When you choose a common phrase the following word is often easy. When you change the subject suddenly the prediction becomes weaker. Meaning constrains language, but language leaves room for invention. The game lives inside that narrow opening.
The weather will change again tomorrow. We might take the long road home. She said the project was almost ready. He asked whether anyone had checked the numbers. They looked at each other and started the test again.
This is not a test of intelligence or vocabulary. It is a small contest between your habits and an adaptive statistical model. Write naturally if you want the score to mean anything. Nonsense is easy to generate and boring to predict.
In the beginning there was only a blank page. After the first word every new choice changed the shape of the sentence. The machine watched for repeated transitions and familiar structures. The writer watched the machine watching back.
If you know what comes next you can prepare for it. If you cannot predict the next move you must remain flexible. Strategy begins where certainty ends. A useful opponent forces you to notice your own routine.
`;

export function normalizeWord(value) {
  return value.trim().toLowerCase().replaceAll("’", "'");
}

export function isValidWord(value) {
  return /^[a-z]+(?:['-][a-z]+)*$/u.test(normalizeWord(value));
}

function increment(map, key, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function incrementNested(table, context, word, amount = 1) {
  if (!table.has(context)) table.set(context, new Map());
  increment(table.get(context), word, amount);
}

function train(text) {
  const model = {
    unigram: new Map(),
    bigram: new Map(),
    trigram: new Map(),
  };

  const sentences = text
    .toLowerCase()
    .split(/[.!?]+/u)
    .map((sentence) => sentence.match(/[a-z]+(?:['-][a-z]+)*/gu) ?? [])
    .filter((tokens) => tokens.length);

  for (const tokens of sentences) {
    const history = [START, START];
    for (const word of tokens) {
      increment(model.unigram, word);
      incrementNested(model.bigram, history.at(-1), word);
      incrementNested(model.trigram, `${history.at(-2)}${JOIN}${history.at(-1)}`, word);
      history.push(word);
    }
  }

  return model;
}

function addWeighted(target, source, weight) {
  if (!source) return;
  for (const [word, count] of source) {
    target.set(word, (target.get(word) ?? 0) + count * weight);
  }
}

function labelForScore(score) {
  if (score === 0) return "CAUGHT";
  if (score < 30) return "READ";
  if (score < 65) return "SLIPPED";
  return "ESCAPED";
}

export class AdaptivePredictor {
  constructor(seedText = SEED_TEXT) {
    this.seed = train(seedText);
    this.session = {
      unigram: new Map(),
      bigram: new Map(),
      trigram: new Map(),
    };
    this.history = [];
  }

  predict() {
    const previous = this.history.at(-1) ?? START;
    const previousTwo = this.history.at(-2) ?? START;
    const context = `${previousTwo}${JOIN}${previous}`;
    const weights = new Map();

    addWeighted(weights, this.seed.trigram.get(context), 10);
    addWeighted(weights, this.seed.bigram.get(previous), 4.5);
    addWeighted(weights, this.session.trigram.get(context), 28);
    addWeighted(weights, this.session.bigram.get(previous), 14);

    for (const [word, count] of this.seed.unigram) {
      weights.set(word, (weights.get(word) ?? 0) + Math.sqrt(count) * 0.2);
    }
    for (const [word, count] of this.session.unigram) {
      weights.set(word, (weights.get(word) ?? 0) + count * 1.8);
    }

    const ordered = [...weights.entries()]
      .filter(([, weight]) => Number.isFinite(weight) && weight > 0)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

    const unseenMass = 3;
    const denominator = ordered.reduce((sum, [, weight]) => sum + weight, unseenMass);
    const probabilities = Object.fromEntries(
      ordered.map(([word, weight]) => [word, weight / denominator]),
    );
    const [guess = "the"] = ordered[0] ?? [];
    const maximumProbability = probabilities[guess] ?? 0.01;

    return Object.freeze({
      guess,
      confidence: maximumProbability,
      probabilities: Object.freeze(probabilities),
      unknownProbability: Math.max(maximumProbability * 0.0001, 0.000001),
      top: Object.freeze(
        ordered.slice(0, 8).map(([word]) => ({ word, probability: probabilities[word] })),
      ),
    });
  }

  score(rawWord, lockedPrediction) {
    const word = normalizeWord(rawWord);
    const probability = lockedPrediction.probabilities[word] ?? lockedPrediction.unknownProbability;
    const maximum = Math.max(lockedPrediction.confidence, Number.EPSILON);
    const ratio = Math.min(1, probability / maximum);
    const exact = word === lockedPrediction.guess;
    const score = exact ? 0 : Math.max(1, Math.min(100, Math.round(100 * (1 - ratio ** 0.28))));
    const rankIndex = lockedPrediction.top.findIndex((candidate) => candidate.word === word);

    return Object.freeze({
      word,
      predicted: lockedPrediction.guess,
      probability,
      rank: rankIndex === -1 ? null : rankIndex + 1,
      exact,
      score,
      label: labelForScore(score),
    });
  }

  observe(rawWord) {
    const word = normalizeWord(rawWord);
    const previous = this.history.at(-1) ?? START;
    const previousTwo = this.history.at(-2) ?? START;

    increment(this.session.unigram, word);
    incrementNested(this.session.bigram, previous, word);
    incrementNested(this.session.trigram, `${previousTwo}${JOIN}${previous}`, word);
    this.history.push(word);
  }
}
