# Exam 2 小實驗結果摘要

資料來源：`/Users/quan/online_judge-paper-cli/reports/qjudge-paper-experiments/exam2-diverse-flash-pro-dataset-20260526-123806` 內的有效實驗結果。這批結果只包含 Exam 2 三題抽樣題目，模型為 DeepSeek V4 Flash 與 DeepSeek V4 Pro。`Human baseline` 取自匯出資料中的 `human_baseline.csv.original_score`，代表既有審核分數；若該分數包含 AI 初改後人審，論文中應命名為「既有審核分數」而非純人工分數。

## 整體結果

- 完成率：6/6 runs completed，批改覆蓋率 100.0%。
- 成本：總成本 $1.02，其中 Flash $0.29、Pro $0.73。
- 時間：總牆鐘時間 26.28 分鐘；Flash 10.23 分鐘、Pro 16.04 分鐘。
- Token：總 token 3,618,293，其中 input 3,478,458、output 139,835。
- Pro 相對 Flash：總時間 1.57x，總成本 2.52x。Pro token 較少，但牆鐘時間與成本較高。

## 模型效率摘要

| Model | Runs | Answers | Runtime min | Cost | Sec/answer | Cent/answer | Token/answer |
| --- | --- | --- | --- | --- | --- | --- | --- |
| DeepSeek V4 Flash | 3 | 353 | 10.23 | $0.29 | 1.74 | 0.082 | 5712 |
| DeepSeek V4 Pro | 3 | 353 | 16.04 | $0.73 | 2.73 | 0.207 | 4538 |

## 逐題時間與成本

| Question | Answers | Flash min | Pro min | Pro/Flash time | Flash cents | Pro cents |
| --- | --- | --- | --- | --- | --- | --- |
| Q6 List methods | 116 | 2.679 | 4.128 | 1.541 | 10 | 28 |
| Q14 Explain coherence | 118 | 3.029 | 7.004 | 2.312 | 9 | 25 |
| Q17 Adv./Disadv. | 119 | 4.527 | 4.91 | 1.085 | 10 | 20 |

## 分數與 baseline 比較

| Question | Model | N | AI mean | Baseline mean | Mean diff | MAE | Exact match |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Q6 List methods | DeepSeek V4 Flash | 116 | 3.18/4 | 3.19/4 | -0.009 | 0.060 | 94.0% |
| Q6 List methods | DeepSeek V4 Pro | 116 | 3.17/4 | 3.19/4 | -0.017 | 0.069 | 93.1% |
| Q14 Explain coherence | DeepSeek V4 Flash | 118 | 1.27/2 | 1.49/2 | -0.220 | 0.305 | 69.5% |
| Q14 Explain coherence | DeepSeek V4 Pro | 118 | 1.04/2 | 1.49/2 | -0.449 | 0.525 | 31.4% |
| Q17 Adv./Disadv. | DeepSeek V4 Flash | 119 | 3.56/4 | 3.91/4 | -0.349 | 0.349 | 73.1% |
| Q17 Adv./Disadv. | DeepSeek V4 Pro | 119 | 3.64/4 | 3.91/4 | -0.269 | 0.269 | 78.2% |

## Flash / Pro 互相比較

| Question | N | Mean abs diff | Exact match | Within 1 pt | Pro higher | Flash higher | Same |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Q6 List methods | 116 | 0.043 | 95.7% | 100.0% | 2 | 3 | 111 |
| Q14 Explain coherence | 118 | 0.492 | 30.5% | 99.2% | 25 | 57 | 36 |
| Q17 Adv./Disadv. | 119 | 0.088 | 89.1% | 100.0% | 12 | 1 | 106 |

## 三題合計分數比較

三題共同出現且三題都有分數的學生數為 115 人，滿分為 10 分。

| Model | Students | AI total mean | Baseline total mean | Total MAE | Exact total | Within 1 pt |
| --- | --- | --- | --- | --- | --- | --- |
| DeepSeek V4 Flash | 115 | 8.06/10 | 8.63/10 | 0.622 | 51.3% | 89.6% |
| DeepSeek V4 Pro | 115 | 7.88/10 | 8.63/10 | 0.809 | 21.7% | 80.9% |

## 初步解讀

1. Q6 屬於列點型題目，Flash 與 Pro 幾乎一致，對 baseline 的 MAE 都低於 0.07 分， exact match 約 93-94%。
2. Q14 屬於概念說明題，是這批小實驗中差異最大的題目。Pro 與 baseline 的 MAE 為 0.525，高於 Flash 的 0.305；Flash/Pro 之間 exact match 只有 30.5%。這題應列為後續人工重點審核與 prompt/rubric 檢查對象。
3. Q17 屬於優缺點列舉題，Pro 較接近 baseline（MAE 0.269 vs Flash 0.349），但兩模型 exact match 仍高達 89.1%。
4. 三題合計來看，Flash 對 baseline 的 total MAE 為 0.622/10，Pro 為 0.809/10；目前這批小樣本下 Flash 較接近既有審核分數，也更便宜且更快。
5. 這批結果只驗證單一 provider 兩個模型與三題抽樣。若要寫成論文主實驗，下一步應加入 OpenAI/Claude、固定 rubric 版本、重跑至少一次以估計模型自我變異，並把人工審核結果作為 final adjudication baseline。

## 產出圖表

- `runtime_cost_by_question.png`
- `model_efficiency_totals.png`
- `score_quality_by_question.png`
- `agreement_by_question.png`
- `score_distribution_by_question.png`

## 產出資料表

- `model_efficiency_summary.csv`
- `question_efficiency_summary.csv`
- `score_metrics_vs_baseline.csv`
- `flash_pro_pairwise_summary.csv`
- `student_total_metrics_vs_baseline.csv`
- `answer_score_comparison.csv`
