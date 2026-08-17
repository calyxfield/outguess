const CHOICES = new Set(["f", "d"]);

function assertChoice(value) {
  const choice = String(value).toLowerCase();
  if (!CHOICES.has(choice)) throw new TypeError("Choice must be F or D");
  return choice;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

export class LegacyBinaryPredictor {
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
    const longest = Math.min(this.maxContext, this.history.length);

    for (let length = 0; length <= longest; length += 1) {
      const counts = this.tables[length].get(this.context(length));
      if (!counts) continue;

      const samples = counts.f + counts.d;
      const estimate = (counts.f + 0.5) / (samples + 1);
      const priorWeight = length === 0 ? 8 : 2 + length * 0.45;
      const strength = samples / (samples + priorWeight);
      probabilityF = probabilityF * (1 - strength) + estimate * strength;
    }

    probabilityF = clamp(probabilityF, 0.02, 0.98);
    return {
      f: probabilityF,
      d: 1 - probabilityF,
      guess: Math.abs(probabilityF - 0.5) < 1e-12 ? null : probabilityF > 0.5 ? "f" : "d",
    };
  }

  observe(rawChoice) {
    const choice = assertChoice(rawChoice);
    const longest = Math.min(this.maxContext, this.history.length);

    for (let length = 0; length <= longest; length += 1) {
      const key = this.context(length);
      const counts = this.tables[length].get(key) ?? { f: 0, d: 0 };
      counts[choice] += 1;
      this.tables[length].set(key, counts);
    }
    this.history.push(choice);
  }
}
