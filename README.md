# Outguess

A deliberately small adversarial prediction game. Press `F` or `D`; an on-device context model assigns a probability to both choices, learns from the sequence, and scores each choice with cross entropy:

`score = -log2(P(choice))`

A 50/50 prediction scores exactly one bit. Higher scores mean the player surprised the model.

## Run

```sh
npm install
npm test
npm run serve
```

No interaction data leaves the browser.
