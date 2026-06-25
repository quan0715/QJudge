# 評分 rubric: SI-LB vs RI-LB

## 題目
Compare Sender-Initiated (SI-LB) and Receiver-Initiated (RI-LB) Load Balancing
algorithms. Which one maintains performance under heavy load?

## 滿分
3 分

## 參考答案
SI-LB probes for underloaded nodes, while RI-LB probes for overloaded nodes.
RI-LB maintains better performance under heavy load because busy nodes do not
waste CPU cycles probing; only idle nodes actively seek work.

## 評分標準

| 分數 | 說明 |
|------|------|
| 3 | 正確說明 SI-LB（忙碌節點 probe 找閒置節點）與 RI-LB（閒置節點 probe 找忙碌節點）的運作方式；明確指出 RI-LB 在 heavy load 下維持效能；並提供合理原因（heavy load 時 SI-LB 持續 probe 浪費資源，RI-LB 只有閒置節點 probe 所以 overhead 低）。 |
| 2 | 正確指出 RI-LB 在 heavy load 表現較佳，對兩者的說明大致正確但可能不夠完整；或正確說明兩者但未充分解釋為何 RI-LB 較適合 heavy load。 |
| 1 | 僅說「RI-LB」而無說明或說明極簡；或僅解釋單一演算法；或說明有明顯錯誤但大方向不至於全錯。 |
| 0 | 回答 SI-LB 在 heavy load 表現較佳；或完全無關內容；或寫「Skip」等未作答。 |

## reason 政策
- 滿分 3 分 → reason 留空
- 非滿分 → 必填 reason，簡短說明扣分依據
