# Exam2 DeepSeek Full-Exam Analysis

Generated: 2026-05-27T04:58:58

## Scope

This analysis uses the consolidated Exam2 read-only AI grading output. It compares two DeepSeek configurations against the exported human/final grading baseline across all subjective/short-answer questions.

- Questions: 19
- Students/subjects: 120
- Per-model scored answers: 2223
- Model runs: 38 completed runs
- Official grades modified: no

## Model-Level Results

| Model | Answers | MAE | RMSE | Exact | Within 0.5 | Bias (AI-Human) | Pearson | Cost | Sec/answer | Cost/1k answers |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| DeepSeek V4 Flash | 2223 | 0.246 | 0.532 | 74.9% | 80.9% | -0.196 | 0.882 | $1.30 | 1.36 | $0.58 |
| DeepSeek V4 Pro | 2223 | 0.298 | 0.618 | 71.8% | 77.3% | -0.255 | 0.852 | $5.05 | 2.51 | $2.27 |

## Student Total Score Agreement

| Model | Students | Total-score MAE | RMSE | Within 1 point | Within 2 points | Bias | Pearson |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| DeepSeek V4 Flash | 120 | 3.654 | 4.231 | 14.2% | 28.3% | -3.629 | 0.975 |
| DeepSeek V4 Pro | 120 | 4.733 | 5.378 | 7.5% | 15.8% | -4.725 | 0.965 |

## Highest-Error Questions

| Model | Question | Answers | MAE | Bias | Exact | Prompt preview |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| DeepSeek V4 Pro | Q15 | 118 | 0.653 | -0.636 | 35.6% | Explain the Cache Coherence problem and the basic rules a system must follow when a CPU wants to write a cached word. |
| DeepSeek V4 Flash | Q12 | 118 | 0.636 | -0.636 | 38.1% | In an SMP system, under what conditions is it more appropriate to use a spin lock versus a blocking lock? |
| DeepSeek V4 Pro | Q4 | 115 | 0.630 | -0.630 | 48.7% | How does affinity scheduling impact cache misses, TLB misses, and page faults in a multiprocessor system? |
| DeepSeek V4 Pro | Q12 | 118 | 0.627 | -0.610 | 38.1% | In an SMP system, under what conditions is it more appropriate to use a spin lock versus a blocking lock? |
| DeepSeek V4 Pro | Q8 | 117 | 0.573 | -0.556 | 42.7% | Compare Sender-Initiated (SI-LB) and Receiver-Initiated (RI-LB) Load Balancing algorithms. Which one maintains performan |
| DeepSeek V4 Pro | Q2 | 118 | 0.555 | -0.555 | 74.6% | Describe the three main types of redundancy used to achieve fault tolerance. |
| DeepSeek V4 Flash | Q14 | 119 | 0.513 | -0.412 | 52.1% | List four common failures that may happen during a Remote Procedure Call (RPC). |
| DeepSeek V4 Flash | Q11 | 113 | 0.473 | -0.438 | 55.8% | Explain how a channel-based publish/subscribe system can be implemented using group communication. |

## Flash vs Pro Agreement

- Answer-level agreement: exact 82.2%, within 0.5 85.3%, MAE between models 0.178.
- Correlation between Flash and Pro scores: 0.913.

## Review Triage Proxy

| Disagreement threshold | Flagged answers | Review workload | Capture of >1-point large errors | Unflagged mean-AI MAE |
| ---: | ---: | ---: | ---: | ---: |
| 0.0 | 396 | 17.8% | 71.6% | 0.181 |
| 0.5 | 396 | 17.8% | 71.6% | 0.181 |
| 1.0 | 326 | 14.7% | 67.2% | 0.194 |
| 1.5 | 41 | 1.8% | 31.9% | 0.251 |
| 2.0 | 26 | 1.2% | 21.6% | 0.254 |

## Main Observations

- Best agreement with human/final baseline in this run: DeepSeek V4 Flash (MAE 0.246, exact 74.9%).
- Lowest measured cost: DeepSeek V4 Flash ($1.30 total, $0.58 per 1,000 answers).
- The full Exam2 run provides the all-question baseline needed for human-in-the-loop review and total-score distribution analysis.

