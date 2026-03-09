> 状態: 2026-03-08  
> 対象: `frontend/src/features/contest/screens/paperExam/ExamPrecheckScreen.tsx`

## 目的

この文書は、paper exam 開始前の pre-check フローと、開始直前検証の失敗時に Step 2 へ戻す挙動を定義します。

## 3 ステップの流れ

1. 資格確認 (Step 1)
2. 環境チェック (Step 2)
3. 開始確認 (Step 3)

## Step 2 のチェック項目（固定順）

1. `singleMonitor`
2. `shareScreen`（`displaySurface` は必ず `monitor`）
3. `fullscreen`
4. `interaction`

## 巻き戻し挙動（Step 3 -> Step 2）

開始前 preflight が失敗した場合:

1. Step 2 に戻します。
2. 該当チェックを `fail` で表示し、詳細理由を出します。
3. 後続チェックを `blocked` にします。
4. 下部アクションを `再テスト` に切り替えます。

## シーケンス図

```mermaid
sequenceDiagram
    participant U as User
    participant UI as ExamPrecheckScreen
    participant DS as DisplayCheckService
    participant SH as ScreenShareHandoff
    participant FS as FullscreenAdapter
    participant API as Exam Start API

    U->>UI: Step 3 で「開始確認」を押下
    UI->>DS: 単一モニター検証
    alt 単一モニター失敗
        DS-->>UI: failure(singleMonitor)
        UI-->>U: Step 2 に戻す + エラー表示 + 再テスト
    else 単一モニター通過
        UI->>SH: 画面共有 handoff 検証
        alt 共有無効 / monitor ではない
            SH-->>UI: failure(shareScreen)
            UI-->>U: Step 2 に戻す + エラー表示 + 再テスト
        else 共有有効
            UI->>FS: フルスクリーン検証
            alt フルスクリーン失敗
                FS-->>UI: failure(fullscreen)
                UI-->>U: Step 2 に戻す + エラー表示 + 再テスト
            else すべて通過
                UI->>API: startSession()
                API-->>UI: started
                UI-->>U: 解答画面へ遷移
            end
        end
    end
```

