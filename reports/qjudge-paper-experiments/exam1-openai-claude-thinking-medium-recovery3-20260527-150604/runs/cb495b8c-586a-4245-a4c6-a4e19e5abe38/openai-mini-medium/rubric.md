# 題目評分準則

- 題目：TLB（Translation Lookaside Buffer）的主要用途
- 滿分：2 分
- 參考答案：透過快取常用的 page table entries，加速 logical-to-physical address translation，減少每次存取需要的記憶體存取次數。

## 評分規則

- 2 分：明確指出 TLB 是用來快取頁表項目／位址轉譯結果，目的是加速虛擬位址到實體位址的轉換或減少記憶體存取。
- 1 分：只提到其中一部分重點，例如「快取頁表項目」、「加速位址轉譯」、「減少記憶體存取」，但沒有完整說明用途。
- 0 分：回答與 TLB 主要用途無關、明顯錯誤，或空白。

## 常見可接受表述

- 快取常用的 page table entries
- 加快 logical/virtual address 到 physical address 的轉換
- 減少查頁表造成的 memory accesses
