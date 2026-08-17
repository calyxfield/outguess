const CHOICES = new Set(["f", "d"]);

function assertChoice(value) {
  const choice = String(value).toLowerCase();
  if (!CHOICES.has(choice)) throw new TypeError("Choice must be F or D");
  return choice;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

export class BinaryPredictor {
  constructor(maxContext = 8) {
    this.maxContext = maxContext;
    this.history = [];
    this.tables = Array.from({ length: maxContext + 1 }, () => new Map());
  }

  context(length) {
    return length === 0 ? "*" : this.history.slice(-length).join("");
  }

  predict() {
    let probabilityF = 0.5;
    const evidence = [];
    const longest = Math.min(this.maxContext, this.history.length);

    for (let length = 0; length <= longest; length += 1) {
      const counts = this.tables[length].get(this.context(length));
      if (!counts) continue;

      const samples = counts.f + counts.d;
      const estimate = (counts.f + 0.5) / (samples + 1);
      const priorWeight = length === 0 ? 8 : 2 + length * 0.45;
      const strength = samples / (samples + priorWeight);
      probabilityF = probabilityF * (1 - strength) + estimate * strength;
      evidence.push({ length, samples, estimate, strength });
    }

    probabilityF = clamp(probabilityF, 0.02, 0.98);
    const probabilityD = 1 - probabilityF;

    return Object.freeze({
      f: probabilityF,
      d: probabilityD,
      guess: Math.abs(probabilityF - 0.5) < 1e-12 ? null : probabilityF > 0.5 ? "f" : "d",
      evidence: Object.freeze(evidence.map((entry) => Object.freeze(entry))),
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
    const longest = Math.min(this.maxContext, this.history.length);

    for (let length = 0; length <= longest; length += 1) {
      const key = this.context(length);
      let counts = this.tables[length].get(key);
      if (!counts) {
        counts = { f: 0, d: 0 };
        this.tables[length].set(key, counts);
      }
      counts[choice] += 1;
    }

    this.history.push(choice);
  }
}
