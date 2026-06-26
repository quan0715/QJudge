# 評分準則：Deadlock 四個必要條件

## 題目
List the four necessary conditions that must hold simultaneously for a system-wide deadlock to occur.

## 滿分
4 分（每正確列出一個條件得 1 分）

## 正確答案
1. **Mutual Exclusion**（互斥）
2. **Hold and Wait**（持有並等待）
3. **No Preemption**（不可搶佔）
4. **Circular Wait**（循環等待）

## 給分標準

| 分數 | 條件 |
|------|------|
| 4 分 | 四個條件皆正確列出（順序不拘） |
| 3 分 | 正確列出三個條件 |
| 2 分 | 正確列出兩個條件 |
| 1 分 | 正確列出一個條件 |
| 0 分 | 完全未列出任何正確條件，或答案與 deadlock 條件無關 |

## 評分原則

- **拼寫/大小寫容錯**：輕微拼寫錯誤（如 "preemtion"、"exclution"、"curcular"、"muture"、"cirtular"）只要可辨識為該條件，即視為正確，不扣分。
- **敘述替代專有名詞**：若學生未寫專有名詞，但用描述性文字清楚表達該概念（如 "資源不可同時與多程式共享" 對應 Mutual Exclusion），可視為正確給分。
- **中英文皆可**：中英文描述皆可接受，只要概念正確。
- **過多錯誤條件不扣分**：學生若列出多於四個條件，只計正確的前四個條件，錯誤的額外條件不扣分，但也不加分。
- **順序不拘**：不需按特定順序列出。
- **reason 政策**：滿分 4 分 → reason 留空；非滿分 → 必填簡短 reason 說明缺了哪些。
