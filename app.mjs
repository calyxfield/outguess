import { AdaptivePredictor, isValidWord, normalizeWord } from "./model.mjs";

const elements = {
  form: document.querySelector("#word-form"),
  input: document.querySelector("#word-input"),
  error: document.querySelector("#entry-error"),
  guess: document.querySelector("#guess"),
  certainty: document.querySelector("#certainty"),
  average: document.querySelector("#average-score"),
  count: document.querySelector("#word-count"),
  catches: document.querySelector("#catch-count"),
  reset: document.querySelector("#reset"),
  empty: document.querySelector("#empty-state"),
  tableWrap: document.querySelector("#table-wrap"),
  log: document.querySelector("#word-log"),
};

let predictor;
let lockedPrediction;
let rounds;

function renderPrediction() {
  elements.guess.textContent = lockedPrediction.guess;
  elements.certainty.textContent = `${Math.round(lockedPrediction.confidence * 100)}% CONFIDENCE`;
}

function renderScoreboard() {
  const score = rounds.length
    ? Math.round(rounds.reduce((sum, round) => sum + round.score, 0) / rounds.length)
    : null;
  elements.average.textContent = score === null ? "—" : String(score).padStart(2, "0");
  elements.count.textContent = String(rounds.length);
  elements.catches.textContent = String(rounds.filter((round) => round.exact).length);
}

function appendRound(round) {
  const row = document.createElement("tr");
  row.className = "new-row";

  const values = [
    String(rounds.length).padStart(2, "0"),
    round.word,
    round.predicted,
    round.label,
    String(round.score).padStart(2, "0"),
  ];

  values.forEach((value, index) => {
    const cell = document.createElement("td");
    cell.textContent = value;
    if (index === 1 || index === 2) cell.className = "word";
    if (index === 3) cell.className = `result-tag${round.exact ? " caught" : ""}`;
    if (index === 4) cell.className = "score";
    row.append(cell);
  });

  elements.log.prepend(row);
  elements.empty.hidden = true;
  elements.tableWrap.hidden = false;
}

function commitWord() {
  const word = normalizeWord(elements.input.value);
  if (!word) return;

  if (!isValidWord(word)) {
    elements.error.textContent = "ONE WORD / LETTERS ONLY";
    return;
  }

  elements.error.textContent = "";
  const result = predictor.score(word, lockedPrediction);
  rounds.push(result);
  appendRound(result);
  renderScoreboard();

  predictor.observe(word);
  lockedPrediction = predictor.predict();
  renderPrediction();

  elements.input.value = "";
  elements.input.focus();
}

function reset() {
  predictor = new AdaptivePredictor();
  lockedPrediction = predictor.predict();
  rounds = [];
  elements.log.replaceChildren();
  elements.empty.hidden = false;
  elements.tableWrap.hidden = true;
  elements.error.textContent = "";
  elements.input.value = "";
  renderPrediction();
  renderScoreboard();
  elements.input.focus();
}

elements.form.addEventListener("submit", (event) => {
  event.preventDefault();
  commitWord();
});

elements.input.addEventListener("keydown", (event) => {
  if (event.key === " " && elements.input.value.trim()) {
    event.preventDefault();
    commitWord();
  }
});

elements.input.addEventListener("input", () => {
  elements.error.textContent = "";
});

elements.reset.addEventListener("click", reset);

reset();
document.documentElement.dataset.ready = "true";
