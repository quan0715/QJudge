# 評分 Rubric — Multithreading Models (Many-to-One vs One-to-One)

## 題目
Compare the 'Many-to-One' and 'One-to-One' multithreading models. Which one allows better utilization of multi-core processors, and why?

## 滿分：3 分

## 參考答案
a. Many-to-One maps many user threads to one kernel thread.
b. One-to-One maps each user thread to a kernel thread.
c. One-to-One is better for multi-core because it allows multiple threads to run in parallel; Many-to-One can only run one thread at a time because the kernel only sees one entity.

## 評分標準

| 給分 | 條件 |
|------|------|
| **3 分** | 正確比較兩種模型（定義正確）+ 正確指出 One-to-One 較佳 + 提供合理原因（kernel 可看到/排程多個 kernel thread 在不同 core 上平行執行，Many-to-One 只有 1 個 kernel thread 故無法充分利用多核） |
| **2 分** | 正確指出 One-to-One 較佳，且有部分解釋，但定義或原因不夠完整；或者定義完整但原因薄弱 |
| **1 分** | 只說出 One-to-One 較佳但幾乎無解釋；或雖有解釋但概念混淆不清；或定義有重大錯誤 |
| **0 分** | 主張 Many-to-One 較佳（無有效理由）或完全答非所問 / 空白 |

## 注意事項
- 語言不影響評分（中英文皆可），只要概念正確。
- 若學生同時寫了矛盾內容（如定義正確但結論錯誤），以結論錯誤為扣分依據。
- 極簡回答（如只寫 "one to one" 無任何解釋）最多 1 分。
- 若學生主張 Many-to-One 較佳但理由合理（如 context switch 較輕、共享資源），仍依參考答案視為不正確，最多 1 分。
