# Outguess

A deliberately small adversarial prediction game. Press `F` or `D`; an on-device Bayesian ensemble privately assigns a probability to both choices from the existing sequence, then reveals the distribution and cross-entropy score after the choice:

`score = -log2(P(choice))`

A 50/50 prediction scores exactly one bit. Higher scores mean the player surprised the model.

## Run

```sh
npm install
npm test
npm run serve
```

No interaction data leaves the browser.

The shipped ensemble combines variable-order KT context, same/switch context,
run-length, and lag experts. It also includes complement-symmetrized aggregate
context counts fitted only on the committed z8rjx training partition. The
aggregate artifact contains no participant identifiers or raw sequences; its
source and reproducible build are documented in `evaluation/README.md`.
