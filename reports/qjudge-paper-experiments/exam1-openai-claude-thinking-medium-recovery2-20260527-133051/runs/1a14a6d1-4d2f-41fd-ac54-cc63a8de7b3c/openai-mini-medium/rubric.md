# 題目評分準則

- 滿分：3 分
- 題型：申論 / 短答
- 批改原則：以是否正確說明「priority inversion」、是否描述 busy waiting / spinlock 造成的情境、是否說明 priority inheritance 的修正機制為準。

## 配分
1. **定義 priority inversion（1 分）**
   - 高優先序工作被低優先序工作阻塞。
   - 若只提到「優先序顛倒」但未說明阻塞關係，可給部分分。

2. **描述 spinlock / busy waiting 造成的情境（1 分）**
   - 低優先序任務持有鎖。
   - 高優先序任務忙等，導致排程器持續執行高優先序任務，低優先序任務得不到 CPU，無法釋放鎖。

3. **說明 priority inheritance（1 分）**
   - 將持鎖的低優先序任務暫時提升到等待它的高優先序任務的優先序。
   - 目的是讓它能儘快執行並釋放鎖。

## 給分規則
- 3 分：三項都正確、完整。
- 2 分：答對其中兩項，或有一項略不完整但核心正確。
- 1 分：只答對一項，或只有模糊提到 priority inversion / inheritance。
- 0 分：幾乎未作答或內容明顯錯誤。

## 常見扣分
- 只解釋 deadlock、starvation，未提 priority inversion：扣分。
- 只寫「提高低優先序工作」但沒說是暫時提升持鎖者：扣分。
- 沒有連結 busy waiting / spinlock 與排程阻塞關係：扣分。