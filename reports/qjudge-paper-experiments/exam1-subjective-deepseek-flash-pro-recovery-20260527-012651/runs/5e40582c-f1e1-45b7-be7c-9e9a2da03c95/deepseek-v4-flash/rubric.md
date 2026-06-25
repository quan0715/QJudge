# 評分準則：Local Replacement vs Global Replacement

## 題目
What is "local replacement" and "global replacement"?

## 滿分
2 分

## 參考答案
- **Local replacement**: a process can only select a replacement frame from its own set of allocated frames.
- **Global replacement**: a process may select a replacement frame from the set of all memory frames.

## 配分標準

| 分數 | 標準 |
|------|------|
| **2 分** | 兩個定義都正確：local 限於 process 自己的 allocated frames；global 可從所有 memory frames（或其他 process 的 frames）中選取。關鍵正確即可，用字略有差異可接受。 |
| **1 分** | 只正確說明其中一個，另一個錯誤／模糊不清；或兩個都僅有部分正確（如概念正確但範圍描述不清）。 |
| **0 分** | 兩個定義皆不正確、空白、完全無關、或只有「忘了」等無效回答。 |

## 備註
- 不扣分項目：拼寫錯誤（如 victom → victim）、格式問題、中英文混用不影響概念正確性者。
- 回答需區分「自己的 page/frame」與「所有/別人的 page/frame」的差異才給分。
- 若僅提到「local 有限制、global 沒有限制」而無具體範圍說明，視為觀念不清，至多得 1 分。
