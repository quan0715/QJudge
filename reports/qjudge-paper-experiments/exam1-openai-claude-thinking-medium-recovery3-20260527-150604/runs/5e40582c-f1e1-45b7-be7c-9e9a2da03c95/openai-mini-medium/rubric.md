# 評分準則

- 題目：What is “local replacement” and “global replacement”?
- 滿分：2 分

## 給分標準

- 2 分：
  - 正確說明 local replacement：程序只能從「自己被分配到的 frames」中選擇要置換的 frame。
  - 正確說明 global replacement：程序可以從「所有 memory frames」中選擇要置換的 frame。
- 1 分：
  - 只正確說明其中一個，或兩者都有提到但其中一個定義不完整／略有瑕疵。
- 0 分：
  - 兩者都未正確說明，或內容明顯混淆 local 與 global replacement。

## 批改重點

- local replacement 的核心是「限制在自己的 allocated frames」。
- global replacement 的核心是「可在整體記憶體 frames 中挑選」。
- 允許同義轉述，但意思必須明確。
