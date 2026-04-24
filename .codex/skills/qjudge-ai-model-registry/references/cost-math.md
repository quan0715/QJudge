# Cost Math Reference

## 單位

- **Pricing 表單位**：cents per 1,000,000 tokens（= USD/1M × 100）。
- **cost_scaled 單位**：cents × 10⁻⁶（即 `tokens × rate`，尚未除以 1M）。
- **Credits 轉換**：`credits = ceil(cost_scaled / SCALE_PER_CREDIT)`，預設 `SCALE_PER_CREDIT = 400_000`（＝1 credit ≈ 0.4 美分成本）。

## 公式

```
cost_scaled  = input_tokens  * PRICING[id]["input"]
             + output_tokens * PRICING[id]["output"]
credits      = ceil(cost_scaled / SCALE_PER_CREDIT)
cost_cents   = cost_scaled / 1_000_000        # 回到 cents
```

## 典型一輪（2K in / 6K out）快速試算

| Model | input rate | output rate | cost_scaled | USD | Credits (÷400k) |
|---|---|---|---|---|---|
| openai-nano | 5 | 20 | 2000×5 + 6000×20 = 130,000 | ¢0.13 | 1 |
| openai-mini | 75 | 450 | 2000×75 + 6000×450 = 2,850,000 | ¢2.85 | 8 |
| openai-mini-medium | 75 | 450 | 2,850,000 | ¢2.85 | 8 |
| deepseek-v4 (flash) | 14 | 28 | 196,000 | ¢0.20 | 1 |
| ~~deepseek-r1~~（已下架） | 55 | 219 | 1,424,000 | ¢1.42 | 4 |

## DeepSeek V4 官方公開 pricing（USD/1M，2026-04）

| Variant | Context | Max out | In (miss) | In (hit) | Out | 專案表現值（cents/1M）|
|---|---|---|---|---|---|---|
| v4-flash | 1M | 384K | $0.14 | $0.028 | $0.28 | in=14, out=28 |
| v4-pro | 1M | 384K | $1.74 | $0.145 | $3.48 | in=174, out=348（若要接） |

## OpenAI（專案表現值）

| id | upstream | in | out |
|---|---|---|---|
| openai-nano | gpt-5-nano | 5 | 20 |
| openai-mini / openai-mini-medium | gpt-5.4-mini | 75 | 450 |

## 實用比較公式

- 兩模型同 input/output 比例下的倍率：`ratio = (a_in + r*a_out) / (b_in + r*b_out)`，其中 `r = output_tokens / input_tokens`。
- 若 output 遠大於 input（典型 r≈3），output rate 是主導：直接比 `output` 欄。

## SCALE_PER_CREDIT 快速感性

- `400_000` → 1 credit ≈ 0.4 cent；Pro 2000 credits/月 ≈ $8 AI 成本預算。
- 調小 SCALE → 每次對話扣更多 credits。預設設定下：
  - openai-nano 一輪扣 1 credit
  - deepseek-v4 一輪扣 1 credit
  - openai-mini / medium 一輪扣 8 credits
