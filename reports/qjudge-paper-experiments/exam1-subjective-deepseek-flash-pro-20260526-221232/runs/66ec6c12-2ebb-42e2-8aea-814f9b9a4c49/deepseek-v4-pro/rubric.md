# 評分準則 (Rubric)

**題目**：What is the result of this code? (fork + execl + printf)
**滿分**：2 分

## 核心知識點
1. `fork()` 產生 child process，parent 與 child 都會執行後續程式碼
2. `execl("/bin/echo", "echo", "hello", 0)` 會以 `/bin/echo hello` **取代**當前 process image
3. 因此 `printf("done\n")` **永遠不會被執行**（兩個 process 都在 execl 處被替換）
4. 結果：`hello` 輸出**兩次**，`done` **不會出現**

## 給分標準

### 2 分（完全正確）
- 明確指出 hello 輸出兩次／兩個 process 各輸出 hello，**且**
- 明確指出 done **不會**被印出，或解釋 execl 取代 process 導致 printf 不執行
- 關鍵判別詞：不會輸出 done、only、不會執行 printf、execl 取代/替換 process image...

### 1 分（部分正確）
- 僅指出 hello 出現兩次，但未提及 done 的狀況
- 或提及 execl 機制但輸出描述有輕微瑕疵
- 學生答案僅呈現輸出內容（如 "hellohello"、"hello hello"）但未說明 done 是否出現 → 1 分

### 0 分（錯誤）
- 主張 done 會被印出
- 僅輸出一個 hello
- 答案與題目完全無關
- 輸出包含 done（如 hellodone、hello done、done done...）
