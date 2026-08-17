const CHOICES = new Set(["f", "d"]);

export const DEFAULT_PREDICTOR_CONFIG = Object.freeze({
  maxContext: 10,
  maxLag: 2,
  maxRun: 3,
  contextOrderDecay: 0.85,
  contextShare: 0.03,
  behaviorShare: 0,
  ensembleShare: 0.01,
  probabilityFloor: 0.005,
  expertPrior: Object.freeze({
    neutral: 2,
    context: 6,
    switchContext: 2,
    run: 1,
    lag: 1,
    population: 6,
  }),
});

function assertChoice(value) {
  const choice = String(value).toLowerCase();
  if (!CHOICES.has(choice)) throw new TypeError("Choice must be F or D");
  return choice;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function normalize(values) {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!(total > 0) || !Number.isFinite(total)) {
    return values.map(() => 1 / values.length);
  }
  return values.map((value) => value / total);
}

function geometricPrior(length, decay) {
  return normalize(Array.from({ length }, (_, index) => decay ** index));
}

function updateMixture(weights, priors, probabilities, choice, share) {
  const likelihoods = probabilities.map((probabilityF) =>
    choice === "f" ? probabilityF : 1 - probabilityF,
  );
  const posterior = normalize(
    weights.map((weight, index) => weight * likelihoods[index]),
  );
  return normalize(
    posterior.map(
      (weight, index) => (1 - share) * weight + share * priors[index],
    ),
  );
}

function contextKey(history, length) {
  return length === 0 ? "*" : history.slice(-length).join("");
}

class ContextOrderExpert {
  constructor(config) {
    this.name = "context";
    this.maxContext = config.maxContext;
    this.share = config.contextShare;
    this.history = [];
    this.tables = Array.from({ length: this.maxContext + 1 }, () => new Map());
    this.priors = geometricPrior(
      this.maxContext + 1,
      config.contextOrderDecay,
    );
    this.weights = [...this.priors];
  }

  componentProbabilities() {
    return this.tables.map((table, length) => {
      if (length > this.history.length) return 0.5;
      const counts = table.get(contextKey(this.history, length)) ?? { f: 0, d: 0 };
      return (counts.f + 0.5) / (counts.f + counts.d + 1);
    });
  }

  predict() {
    const probabilities = this.componentProbabilities();
    return probabilities.reduce(
      (sum, probability, index) => sum + this.weights[index] * probability,
      0,
    );
  }

  observe(rawChoice) {
    const choice = assertChoice(rawChoice);
    const probabilities = this.componentProbabilities();
    this.weights = updateMixture(
      this.weights,
      this.priors,
      probabilities,
      choice,
      this.share,
    );

    const longest = Math.min(this.maxContext, this.history.length);
    for (let length = 0; length <= longest; length += 1) {
      const key = contextKey(this.history, length);
      const counts = this.tables[length].get(key) ?? { f: 0, d: 0 };
      counts[choice] += 1;
      this.tables[length].set(key, counts);
    }
    this.history.push(choice);
  }
}

class SwitchContextExpert {
  constructor(config) {
    this.name = "switchContext";
    this.history = [];
    this.model = new ContextOrderExpert({
      ...config,
      maxContext: Math.min(6, config.maxContext),
    });
  }

  predict() {
    if (this.history.length === 0) return 0.5;
    const probabilitySame = this.model.predict();
    return this.history.at(-1) === "f" ? probabilitySame : 1 - probabilitySame;
  }

  observe(rawChoice) {
    const choice = assertChoice(rawChoice);
    if (this.history.length > 0) {
      const relation = choice === this.history.at(-1) ? "f" : "d";
      this.model.observe(relation);
    }
    this.history.push(choice);
  }
}

class RunExpert {
  constructor(config) {
    this.name = "run";
    this.maxRun = config.maxRun;
    this.lastChoice = null;
    this.runLength = 0;
    this.counts = Array.from({ length: this.maxRun }, () => ({ stay: 0, switch: 0 }));
  }

  currentBin() {
    return Math.min(this.runLength, this.maxRun) - 1;
  }

  predict() {
    if (this.lastChoice === null) return 0.5;
    const counts = this.counts[this.currentBin()];
    const probabilityStay = (counts.stay + 0.5) / (counts.stay + counts.switch + 1);
    return this.lastChoice === "f" ? probabilityStay : 1 - probabilityStay;
  }

  observe(rawChoice) {
    const choice = assertChoice(rawChoice);
    if (this.lastChoice === null) {
      this.lastChoice = choice;
      this.runLength = 1;
      return;
    }

    const stayed = choice === this.lastChoice;
    this.counts[this.currentBin()][stayed ? "stay" : "switch"] += 1;
    if (stayed) {
      this.runLength += 1;
    } else {
      this.lastChoice = choice;
      this.runLength = 1;
    }
  }
}

class LagExpert {
  constructor(config) {
    this.name = "lag";
    this.maxLag = config.maxLag;
    this.share = config.behaviorShare;
    this.history = [];
    this.counts = Array.from({ length: this.maxLag }, () => ({ same: 0, different: 0 }));
    this.priors = normalize(
      Array.from({ length: this.maxLag }, (_, index) => 1 / (index + 1) ** 1.5),
    );
    this.weights = [...this.priors];
  }

  componentProbabilities() {
    return this.counts.map((counts, index) => {
      const lag = index + 1;
      if (lag > this.history.length) return 0.5;
      const probabilitySame =
        (counts.same + 0.5) / (counts.same + counts.different + 1);
      return this.history.at(-lag) === "f" ? probabilitySame : 1 - probabilitySame;
    });
  }

  predict() {
    const probabilities = this.componentProbabilities();
    return probabilities.reduce(
      (sum, probability, index) => sum + this.weights[index] * probability,
      0,
    );
  }

  observe(rawChoice) {
    const choice = assertChoice(rawChoice);
    const probabilities = this.componentProbabilities();
    this.weights = updateMixture(
      this.weights,
      this.priors,
      probabilities,
      choice,
      this.share,
    );

    for (let index = 0; index < this.maxLag; index += 1) {
      const lag = index + 1;
      if (lag > this.history.length) break;
      const relation = choice === this.history.at(-lag) ? "same" : "different";
      this.counts[index][relation] += 1;
    }
    this.history.push(choice);
  }
}

class PopulationContextExpert {
  constructor(config, populationPrior) {
    this.name = "population";
    this.maxContext = Math.min(config.maxContext, populationPrior.orders.length - 1);
    this.share = config.contextShare;
    this.history = [];
    this.tables = populationPrior.orders.slice(0, this.maxContext + 1);
    this.priors = geometricPrior(
      this.maxContext + 1,
      config.contextOrderDecay,
    );
    this.weights = [...this.priors];
  }

  componentProbabilities() {
    return this.tables.map((table, length) => {
      if (length > this.history.length) return 0.5;
      const counts = table[contextKey(this.history, length)];
      if (!counts) return 0.5;
      return (counts.f + 0.5) / (counts.f + counts.d + 1);
    });
  }

  predict() {
    const probabilities = this.componentProbabilities();
    return probabilities.reduce(
      (sum, probability, index) => sum + this.weights[index] * probability,
      0,
    );
  }

  observe(rawChoice) {
    const choice = assertChoice(rawChoice);
    const probabilities = this.componentProbabilities();
    this.weights = updateMixture(
      this.weights,
      this.priors,
      probabilities,
      choice,
      this.share,
    );
    this.history.push(choice);
  }
}

function complementChoice(choice) {
  return choice === "f" ? "d" : "f";
}

function complementContext(context) {
  if (context === "*") return context;
  return [...context].map(complementChoice).join("");
}

export function buildPopulationPrior(sequences, maxContext = 8) {
  const orders = Array.from({ length: maxContext + 1 }, () => Object.create(null));

  for (const rawSequence of sequences) {
    const history = [];
    for (const rawChoice of rawSequence) {
      const choice = assertChoice(rawChoice);
      const longest = Math.min(maxContext, history.length);
      for (let length = 0; length <= longest; length += 1) {
        const key = contextKey(history, length);
        const mirrorKey = complementContext(key);
        const counts = orders[length][key] ?? { f: 0, d: 0 };
        counts[choice] += 1;
        orders[length][key] = counts;

        const mirrorCounts = orders[length][mirrorKey] ?? { f: 0, d: 0 };
        mirrorCounts[complementChoice(choice)] += 1;
        orders[length][mirrorKey] = mirrorCounts;
      }
      history.push(choice);
    }
  }

  return Object.freeze({
    version: 1,
    maxContext,
    orders: Object.freeze(
      orders.map((order) =>
        Object.freeze(
          Object.fromEntries(
            Object.entries(order).map(([key, counts]) => [key, Object.freeze({ ...counts })]),
          ),
        ),
      ),
    ),
  });
}

export class BinaryPredictor {
  constructor(options = {}) {
    const { populationPrior = null, ...overrides } = options;
    this.config = {
      ...DEFAULT_PREDICTOR_CONFIG,
      ...overrides,
      expertPrior: {
        ...DEFAULT_PREDICTOR_CONFIG.expertPrior,
        ...(overrides.expertPrior ?? {}),
      },
    };
    this.history = [];
    this.experts = [
      { name: "neutral", predict: () => 0.5, observe: () => {} },
      new ContextOrderExpert(this.config),
      new SwitchContextExpert(this.config),
      new RunExpert(this.config),
      new LagExpert(this.config),
    ];
    if (populationPrior) {
      this.experts.push(
        new PopulationContextExpert(this.config, populationPrior),
      );
    }

    this.priors = normalize(
      this.experts.map((expert) => this.config.expertPrior[expert.name] ?? 1),
    );
    this.weights = [...this.priors];
  }

  expertProbabilities() {
    return this.experts.map((expert) =>
      clamp(expert.predict(), this.config.probabilityFloor, 1 - this.config.probabilityFloor),
    );
  }

  predict() {
    const probabilities = this.expertProbabilities();
    let probabilityF = probabilities.reduce(
      (sum, probability, index) => sum + this.weights[index] * probability,
      0,
    );
    probabilityF = clamp(
      probabilityF,
      this.config.probabilityFloor,
      1 - this.config.probabilityFloor,
    );
    const probabilityD = 1 - probabilityF;

    return Object.freeze({
      f: probabilityF,
      d: probabilityD,
      guess:
        Math.abs(probabilityF - 0.5) < 1e-12
          ? null
          : probabilityF > 0.5
            ? "f"
            : "d",
      evidence: Object.freeze(
        this.experts.map((expert, index) =>
          Object.freeze({
            name: expert.name,
            probabilityF: probabilities[index],
            weight: this.weights[index],
          }),
        ),
      ),
    });
  }

  score(rawChoice, distribution) {
    const choice = assertChoice(rawChoice);
    const probability = distribution[choice];
    const loss = -Math.log2(probability);

    return Object.freeze({
      choice,
      probability,
      loss,
      guess: distribution.guess,
      correct: distribution.guess === null ? null : distribution.guess === choice,
      distribution,
    });
  }

  observe(rawChoice) {
    const choice = assertChoice(rawChoice);
    const probabilities = this.expertProbabilities();
    this.weights = updateMixture(
      this.weights,
      this.priors,
      probabilities,
      choice,
      this.config.ensembleShare,
    );
    for (const expert of this.experts) expert.observe(choice);
    this.history.push(choice);
  }
}
