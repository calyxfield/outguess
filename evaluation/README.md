# Predictor evaluation

`split-manifest.json` fixes a participant-level, condition-stratified split of
the 388-person `z8rjx` cohort. The validation partition selected the predictor
configuration. The internal test is useful but not pristine because aggregate
results for the whole cohort were inspected before the split existed.

`external-test-protocol.md` fixes the untouched final evaluation on Study 2 of
Biesaga and Nowak (2024) before any external predictor metric was computed.

## Population prior provenance

`population-prior.mjs` is generated only from the 232 participants in the
committed `z8rjx` training partition:

```sh
npm run build:prior -- /path/to/z8rjx/dat.csv
```

The source is “Top-Down Control in Random Choice” by Maja Guseva, John-Dylan
Haynes, Carsten Bogler, and Carsten Allefeld, available at
https://osf.io/z8rjx/ under CC BY 4.0. The generated artifact is a transformed,
complement-symmetrized table of aggregate context counts. It includes no
participant identifiers and no raw sequences. Its embedded metadata records
the source, split-manifest, and packed-count SHA-256 hashes.

## Evaluation

```sh
node evaluation/evaluate.mjs --partition validation --data /path/to/z8rjx/dat.csv
node evaluation/evaluate.mjs --partition test --data /path/to/z8rjx/dat.csv
node evaluation/evaluate-external.mjs
```

Bits per choice is primary. Accuracy counts an exact 50/50 forecast as 0.5
correct rather than dropping ties.
