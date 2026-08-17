# Outguess

A one-screen prototype where a local adaptive word model commits to its next-word prediction before the player enters a word. Each word receives an evasion score based on its modeled probability relative to the locked favorite, then becomes training data for the next round.

## Run

```sh
npm install
npm test
npm run serve
```

The first prototype deliberately uses an auditable on-device n-gram ensemble rather than a paid language-model endpoint. No entered text leaves the browser.
