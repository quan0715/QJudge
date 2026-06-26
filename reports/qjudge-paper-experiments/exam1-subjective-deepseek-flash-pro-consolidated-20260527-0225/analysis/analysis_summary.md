# Exam1 DeepSeek Full-Exam Analysis

Generated: 2026-05-27T02:46:26

## Scope

This analysis uses the consolidated Exam1 read-only AI grading output. It compares two DeepSeek configurations against the exported human grading baseline across all subjective/short-answer questions.

- Questions: 25
- Students/subjects: 123
- Per-model scored answers: 3008
- Model runs: 50 completed runs
- Official grades modified: no

## Model-Level Results

| Model | Answers | MAE | RMSE | Exact | Within 0.5 | Bias (AI-Human) | Pearson | Cost | Sec/answer | Cost/1k answers |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| DeepSeek V4 Flash | 3008 | 0.249 | 0.552 | 75.1% | 82.0% | -0.139 | 0.889 | $1.94 | 1.78 | $0.64 |
| DeepSeek V4 Pro | 3008 | 0.289 | 0.590 | 70.8% | 78.8% | -0.194 | 0.883 | $6.02 | 2.35 | $2.00 |

## Student Total Score Agreement

| Model | Students | Total-score MAE | RMSE | Within 1 point | Within 2 points | Bias | Pearson |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| DeepSeek V4 Flash | 123 | 3.528 | 4.231 | 17.9% | 37.4% | -3.390 | 0.957 |
| DeepSeek V4 Pro | 123 | 4.789 | 5.556 | 8.9% | 16.3% | -4.748 | 0.947 |

## Highest-Error Questions

| Model | Question | Answers | MAE | Bias | Exact | Prompt preview |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| DeepSeek V4 Flash | Q17 | 122 | 0.840 | -0.840 | 41.0% | Compare the 'Many-to-One' and 'One-to-One' multithreading models. Which one allows better utilization of multi-core proc |
| DeepSeek V4 Pro | Q19 | 119 | 0.756 | -0.756 | 35.3% | What is the primary purpose of the 'Translation Lookaside Buffer' (TLB) in a paging system? |
| DeepSeek V4 Pro | Q17 | 122 | 0.709 | -0.693 | 55.7% | Compare the 'Many-to-One' and 'One-to-One' multithreading models. Which one allows better utilization of multi-core proc |
| DeepSeek V4 Pro | Q2 | 123 | 0.618 | -0.585 | 31.7% | What is the result of this code? ```c main() { fork(); execl("/bin/echo", "echo", "hello", 0); printf("done\n"); } ``` |
| DeepSeek V4 Pro | Q15 | 111 | 0.541 | -0.486 | 50.5% | Describe the three requirements that a solution to the Critical Section problem must satisfy to be considered correct. |
| DeepSeek V4 Flash | Q19 | 119 | 0.521 | -0.521 | 47.1% | What is the primary purpose of the 'Translation Lookaside Buffer' (TLB) in a paging system? |
| DeepSeek V4 Pro | Q24 | 123 | 0.488 | -0.439 | 52.0% | Please briefly describe the Direct Memory Access (DMA)? |
| DeepSeek V4 Flash | Q24 | 123 | 0.480 | -0.447 | 54.5% | Please briefly describe the Direct Memory Access (DMA)? |

## Flash vs Pro Agreement

- Answer-level agreement: exact 77.4%, within 0.5 84.3%, MAE between models 0.200.
- Correlation between Flash and Pro scores: 0.927.

## Review Triage Proxy

| Disagreement threshold | Flagged answers | Review workload | Capture of >1-point large errors | Unflagged mean-AI MAE |
| ---: | ---: | ---: | ---: | ---: |
| 0.0 | 680 | 22.6% | 77.0% | 0.164 |
| 0.5 | 680 | 22.6% | 77.0% | 0.164 |
| 1.0 | 472 | 15.7% | 64.6% | 0.186 |
| 1.5 | 31 | 1.0% | 15.7% | 0.257 |
| 2.0 | 17 | 0.6% | 9.0% | 0.259 |

## Main Observations

- Best agreement with human baseline in this run: DeepSeek V4 Flash (MAE 0.249, exact 75.1%).
- Lowest measured cost: DeepSeek V4 Flash ($1.94 total, $0.64 per 1,000 answers).
- Fastest per-answer runtime: DeepSeek V4 Flash (1.78 seconds/answer).
- Both DeepSeek configurations show negative bias on average, meaning they graded slightly lower than the human baseline.
- The largest errors are concentrated in a small number of questions, which supports question-level QA and targeted rubric refinement rather than treating model quality as uniform across an exam.
- Flash outperformed Pro on this Exam1 baseline while costing less, so the current evidence does not support assuming the Pro model is automatically better for grading.

## Files

- `answer_score_comparison.csv`
- `score_metrics_vs_baseline.csv`
- `model_efficiency_summary.csv`
- `question_efficiency_summary.csv`
- `student_total_score_comparison.csv`
- `student_total_metrics_vs_baseline.csv`
- `pairwise_model_agreement.csv`
- `review_triage_by_model_disagreement.csv`
- `model_quality_vs_human.png`
- `model_efficiency_totals.png`
- `mae_by_question_model.png`
- `bias_by_question_model.png`
- `student_total_score_scatter.png`
- `score_distribution_human_vs_ai.png`
- `review_triage_curve.png`
