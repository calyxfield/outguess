# Frozen evaluation results

All values are unweighted participant means over each participant's first 100
choices. Bits per choice is primary. Accuracy includes all rounds and gives an
exact 50/50 forecast 0.5 expected-correct credit.

Configuration SHA-256:
`64d93e0913078e2ba10c50ae4972ad8b35849eb4f69648c724affcf5ad80f6ea`.

| Cohort | Model | Bits/choice | Accuracy |
| --- | --- | ---: | ---: |
| z8rjx validation (77) | neutral | 1.000000 | 50.00% |
|  | legacy | 0.899096 | 62.84% |
|  | improved, untrained | 0.864753 | 64.75% |
|  | improved + train prior | **0.862046** | **65.12%** |
| z8rjx internal test (79) | neutral | 1.000000 | 50.00% |
|  | legacy | 0.924119 | 62.77% |
|  | improved, untrained | 0.885403 | 63.11% |
|  | improved + train prior | **0.882701** | **63.18%** |
| ck78n external test (142) | neutral | 1.000000 | 50.00% |
|  | legacy | 1.000826 | 56.10% |
|  | improved, untrained | **0.954946** | **57.28%** |
|  | improved + train prior | 0.957053 | 55.87% |

The z8rjx internal test is not pristine because aggregate whole-cohort results
were inspected before its split existed. On that test, the shipped model lowers
legacy log loss by 0.04142 bits/choice (4.48%) and raises accuracy by 0.42
percentage points.

The ck78n Study 2 cohort is the untouched final external test. The untrained
ensemble lowers legacy log loss by 0.04588 bits/choice (4.58%) and raises
accuracy by 1.18 percentage points. The z8rjx population prior reverses by a
small 0.00211 bits/choice against the untrained ensemble on this different task,
though it still beats the legacy predictor on the primary metric. The external
task asked participants to imagine fair coin tosses using comma and period,
showed the previous seven choices, and was timed; it is not an adversarial
session against Outguess.

The external evaluator verified both raw input hashes and the frozen normalized
cohort hash before calculating predictions. Its first invocation stopped before
metrics because numeric ID collation did not match the precommitted plain-ID
ordering; commit `2cafcd7` corrected that evaluator bug without changing the
protocol, normalized cohort, predictor, or frozen configuration.
