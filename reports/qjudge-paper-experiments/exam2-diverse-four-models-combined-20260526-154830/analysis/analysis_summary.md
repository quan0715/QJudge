# Exam2 Four-Model Pilot Analysis

Generated: 2026-05-26T15:49:23

## Scope

This report combines completed read-only grading runs for three Exam2 questions and four model configurations:

- DeepSeek V4 Flash
- DeepSeek V4 Pro
- OpenAI Mini (low reasoning)
- OpenAI Mini (medium reasoning)

Incomplete or failed attempts were excluded from the quantitative tables. The Q14 OpenAI Mini (medium) run was rerun after increasing the ai-service agent recursion limit so the run produced both a complete `grade.csv` and a `usage_report`.

## Completed Runs

| Question              | Model                | Answers | Seconds | Input tokens | Output tokens | Cost cents | Cost/answer cents |
| --------------------- | -------------------- | ------- | ------- | ------------ | ------------- | ---------- | ----------------- |
| Q6 List methods       | DeepSeek V4 Flash    | 116     | 160.8   | 678,610      | 18,186        | 10         | 0.086             |
| Q6 List methods       | DeepSeek V4 Pro      | 116     | 247.7   | 620,254      | 13,721        | 28         | 0.241             |
| Q6 List methods       | OpenAI Mini (low)    | 116     | 105.1   | 431,934      | 5,011         | 35         | 0.302             |
| Q6 List methods       | OpenAI Mini (medium) | 116     | 111.0   | 322,856      | 9,989         | 29         | 0.250             |
| Q14 Explain coherence | DeepSeek V4 Flash    | 118     | 181.8   | 592,992      | 23,628        | 9          | 0.076             |
| Q14 Explain coherence | DeepSeek V4 Pro      | 118     | 420.3   | 511,592      | 26,214        | 25         | 0.212             |
| Q14 Explain coherence | OpenAI Mini (low)    | 118     | 87.2    | 236,196      | 5,871         | 20         | 0.169             |
| Q14 Explain coherence | OpenAI Mini (medium) | 118     | 202.4   | 809,484      | 9,540         | 65         | 0.551             |
| Q17 Adv./Disadv.      | DeepSeek V4 Flash    | 119     | 271.6   | 663,452      | 39,628        | 10         | 0.084             |
| Q17 Adv./Disadv.      | DeepSeek V4 Pro      | 119     | 294.6   | 411,558      | 18,458        | 20         | 0.168             |
| Q17 Adv./Disadv.      | OpenAI Mini (low)    | 119     | 72.2    | 196,211      | 6,108         | 17         | 0.143             |
| Q17 Adv./Disadv.      | OpenAI Mini (medium) | 119     | 151.0   | 363,003      | 10,442        | 32         | 0.269             |

## Model-Level Summary

| Model                | Total seconds | Total cost cents | Seconds/answer | Cost/answer cents | MAE   | Exact match | Within 1 |
| -------------------- | ------------- | ---------------- | -------------- | ----------------- | ----- | ----------- | -------- |
| DeepSeek V4 Flash    | 614.1         | 29               | 1.740          | 0.082             | 0.239 | 0.788       | 0.975    |
| DeepSeek V4 Pro      | 962.5         | 73               | 2.727          | 0.207             | 0.289 | 0.674       | 0.958    |
| OpenAI Mini (low)    | 264.5         | 72               | 0.749          | 0.204             | 0.246 | 0.805       | 0.952    |
| OpenAI Mini (medium) | 464.3         | 126              | 1.315          | 0.357             | 0.184 | 0.844       | 0.972    |

## Main Observations

- Best overall agreement with the existing human baseline by MAE: OpenAI Mini (medium) (MAE 0.184).
- Fastest total runtime across the three pilot questions: OpenAI Mini (low) (264.5 seconds).
- Lowest measured cost across the three pilot questions: DeepSeek V4 Flash (29 cents).
- OpenAI Mini (low) finished the three questions fastest in this run set; OpenAI Mini (medium) was costlier mainly because Q14 consumed 809,484 input tokens.
- DeepSeek V4 Flash remains the lowest-cost configuration in this sample, while DeepSeek V4 Pro was slower and more expensive than Flash.

## Files

- `combined_summary.csv`: all selected completed run metadata.
- `answer_score_comparison.csv`: per-answer model score joined with the exported human baseline.
- `analysis/score_metrics_vs_baseline.csv`: per-question MAE, RMSE, exact-match, and correlation.
- `analysis/model_efficiency_summary.csv`: model-level runtime, cost, and agreement summary.
- `analysis/pairwise_model_agreement.csv`: AI-vs-AI agreement by question.
- `analysis/*.png`: chart outputs.
