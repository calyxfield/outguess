# External test protocol

The untouched external cohort is Study 2 from Biesaga and Nowak (2024), OSF project `ck78n`.

Freeze date: 2026-08-17, before computing any predictor metric on this cohort.

## Inputs

- `study2_random_df.csv`: https://osf.io/download/64f4d2a3152ffd022fce1553/
  (SHA-256 `48d0506420d66d5a2f5c3043065882b3e7482622cc5c7e314a6331a3e63f6195`).
- `study2_wm_df.csv`: https://osf.io/download/64f4d2a3152ffd022fce1555/
  (SHA-256 `86e88173ff6f86d354b82995cde8e5ecc4171f51ab1f7a193d20a70db68892ba`).

## Participant exclusions

Reproduce the authors' Study 2 analysis exactly:

- Keep `correct_digits > 0.85`.
- Keep `partial_correct_complex > 3` and `< 11`.
- Inner-join eligible participant IDs to the random-generation data.
- Require at least 100 valid binary choices. The paper reports retained sequence lengths of 103–120.

## Choice normalization

- Sort each participant's rows by `ids` ascending.
- Map `key = 1` to `f` and `key = 0` to `d`. The predictor is complement-invariant, so the names are arbitrary.
- Evaluate only the first 100 chronological valid choices.
- Do not use reaction time, demographics, task order, working-memory score, or later choices as predictor inputs.

The normalized cohort must contain exactly 142 participants and 14,200 rows.
Serialize each participant in ascending ID order and each retained row as
`${id},${ids},${key}\n`. The canonical bytes must have length 424,864 and
SHA-256 `985dd0efb718c8403735658ff196141cb7a9cff62ced0160255496ad60924f40`.

## Metrics

- Primary: total and mean base-2 log loss per participant, then the unweighted mean across participants.
- Secondary: hard-choice accuracy across all 100 rounds. A forecast exactly equal to 0.5 earns 0.5 expected correctness, so ties are not discarded.
- Report the neutral 0.5 baseline, legacy predictor, frozen improved predictor without population priors, and the same frozen predictor with any z8rjx-train-only prior selected before this test.

The z8rjx internal split is not described as pristine because aggregate exploratory results from all 388 participants were inspected before the split was created. The ck78n Study 2 metrics are the final untouched external result.
