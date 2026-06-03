# Rubric: Multiprocessor OS Architectural Approaches

**題目**: What are the three basic architectural approaches for Multiprocessor Operating Systems?
**滿分**: 3 分（每答對一個架構得 1 分）

## 參考答案（三個正確架構）

| # | 英文標準答案 | 可接受的中文/簡稱/同義表述 |
|---|-------------|---------------------------|
| 1 | Each CPU has its own Operating System | 每個 CPU 有自己的 OS / Separate OS per CPU / 各自為政 / 各自擁有自己的 OS |
| 2 | Master-Slave Multiprocessors | MS-MP / 主從式多處理器 / Master-Slave architecture |
| 3 | Symmetric Multiprocessors (SMP) | SMP / 對稱式多處理器 / Symmetric architecture |

## 評分規則

1. **每正確列出一個架構得 1 分**，滿分 3 分。
2. **順序不拘**，只要概念正確即可。
3. **拼寫輕微錯誤不扣分**（如 symmertric, symetric, mulitprocessor 等），只要仍可辨識。
4. **用中文回答可接受**，只要概念對應正確。
5. **只寫簡稱（如 MS-MP, SMP）也算對**，前提是能對應到正確概念。
6. **多寫了不屬於三個基本架構的內容（如 shared memory, caching, UMA, NUMA 等）→ 該項不算對，因為題目問的是 OS 架構而非硬體架構。**
7. **完全離題或答非所問 → 0 分。**
8. **只列出一或兩個正確架構 → 依正確數量給分。**

## 評語政策

- 滿分（3 分）且答案完整正確 → reason 留空。
- 非滿分（0-2 分）→ reason 簡述扣分原因。
