# Rubric: "What is 'local replacement' and 'global replacement'?"

**滿分：2 分**
本題為 OS 記憶體管理中的 page/frame replacement 策略定義題。

## 評分標準

### Local Replacement（1 分）
- 核心概念：process 只能從**自己被分配到的 frames**（own allocated frames）中挑選 victim frame 進行替換。
- 給分條件：明確表達「限於自身 allocated frames / own set」即給 1 分。
- 扣分：若僅說「limited scope / 有限範圍」而未指明是自身 allocated frames，酌扣 0.5 分。

### Global Replacement（1 分）
- 核心概念：process 可以從**整個記憶體的所有 frames**（all memory frames），包括其他 process 的 frames 中挑選 victim frame。
- 給分條件：明確表達「所有 frames / all memory frames / 可跨 process」即給 1 分。
- 扣分：若僅說「unlimited / 較大範圍」而未指明所有 frames 或跨 process，酌扣 0.5 分。

### 其他扣分/給分指引
- 答非所問、完全空白、僅寫「忘了」→ 0 分。
- 答案格式異常（如 JSON 亂碼）但內容仍可辨識核心概念 → 依內容給分。
- 用詞不精確但核心概念正確 → 給滿分。
- 兩者定義顛倒 → 0 分。
- 若作答中混入不相關或明顯錯誤的額外描述，但核心定義仍正確 → 不扣分。

## 給分速查
| 狀況 | 分數 |
|------|------|
| 兩個定義都正確 | 2 |
| 僅一個定義正確，另一個錯誤或缺漏 | 1 |
| 兩個定義都不正確 / 未作答 | 0 |
