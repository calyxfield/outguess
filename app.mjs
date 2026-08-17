import { BinaryPredictor } from "./model.mjs";

const elements = {
  probabilityF: document.querySelector("#probability-f"),
  probabilityD: document.querySelector("#probability-d"),
  barF: document.querySelector("#bar-f"),
  barD: document.querySelector("#bar-d"),
  lastChoice: document.querySelector("#last-choice"),
  lastScore: document.querySelector("#last-score"),
  lastProbability: document.querySelector("#last-probability"),
  average: document.querySelector("#average-score"),
  count: document.querySelector("#choice-count"),
  accuracy: document.querySelector("#model-accuracy"),
  sequence: document.querySelector("#sequence"),
  empty: document.querySelector("#empty-state"),
  buttons: [...document.querySelectorAll("[data-choice]")],
  reset: document.querySelector("#reset"),
  live: document.querySelector("#live-result"),
};

let predictor;
let rounds;

function percent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function renderDistribution(distribution) {
  if (!distribution) {
    elements.probabilityF.textContent = "—";
    elements.probabilityD.textContent = "—";
    elements.barF.style.width = "0%";
    elements.barD.style.width = "0%";
    return;
  }
  elements.probabilityF.textContent = percent(distribution.f);
  elements.probabilityD.textContent = percent(distribution.d);
  elements.barF.style.width = percent(distribution.f);
  elements.barD.style.width = percent(distribution.d);
}

function renderMetrics() {
  const average = rounds.length
    ? rounds.reduce((sum, round) => sum + round.loss, 0) / rounds.length
    : null;
  const decided = rounds.filter((round) => round.correct !== null);
  const accuracy = decided.length
    ? decided.filter((round) => round.correct).length / decided.length
    : null;

  elements.average.textContent = average === null ? "—" : average.toFixed(2);
  elements.count.textContent = String(rounds.length);
  elements.accuracy.textContent = accuracy === null ? "—" : percent(accuracy);
}

function appendChoice(round) {
  const item = document.createElement("span");
  item.className = `choice-token choice-${round.choice}`;
  item.title = `Model assigned ${percent(round.probability)}`;

  const choice = document.createElement("strong");
  choice.textContent = round.choice.toUpperCase();
  const score = document.createElement("small");
  score.textContent = round.loss.toFixed(2);

  item.append(choice, score);
  elements.sequence.append(item);
  elements.empty.hidden = true;
  item.scrollIntoView({ block: "nearest", inline: "nearest" });
}

function choose(rawChoice) {
  const distribution = predictor.predict();
  const round = predictor.score(rawChoice, distribution);
  rounds.push(round);
  appendChoice(round);

  elements.lastChoice.textContent = round.choice.toUpperCase();
  elements.lastScore.textContent = round.loss.toFixed(2);
  elements.lastProbability.textContent = `${percent(round.probability)} ASSIGNED`;
  elements.live.textContent = `${round.choice.toUpperCase()} scored ${round.loss.toFixed(2)} bits`;

  renderDistribution(distribution);
  predictor.observe(round.choice);
  renderMetrics();
}

function reset() {
  predictor = new BinaryPredictor();
  rounds = [];
  elements.sequence.replaceChildren();
  elements.empty.hidden = false;
  elements.lastChoice.textContent = "—";
  elements.lastScore.textContent = "—";
  elements.lastProbability.textContent = "NO CHOICE YET";
  elements.live.textContent = "Game reset";
  renderDistribution(null);
  renderMetrics();
}

for (const button of elements.buttons) {
  button.addEventListener("click", () => choose(button.dataset.choice));
}

document.addEventListener("keydown", (event) => {
  if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
  const choice = event.key.toLowerCase();
  if (choice !== "f" && choice !== "d") return;
  event.preventDefault();
  choose(choice);
});

elements.reset.addEventListener("click", reset);

reset();
document.documentElement.dataset.ready = "true";
