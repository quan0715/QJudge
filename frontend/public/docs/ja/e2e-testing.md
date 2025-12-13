# E2E テストガイド

本ドキュメントでは、フロントエンド E2E テストの設定と実行方法について説明します。

## 概要

本プロジェクトでは Playwright を使用してエンドツーエンド（E2E）テストを行い、Docker Compose で完全なテスト環境を提供しています：

- 専用のテストデータベース（PostgreSQL）
- テスト用 Redis
- Django バックエンドテストサービス
- Celery Worker（提出処理用）
- React フロントエンドテストサービス
- 事前投入されたテストデータ

## アーキテクチャ

```
┌─────────────────────────────────────────────────────────┐
│                    Playwright テスト                     │
│              (Chrome + Safari デュアルブラウザ)          │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│              Docker Compose テスト環境                   │
│              (docker-compose.test.yml)                  │
├─────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ frontend-test│  │ backend-test │  │ celery-test  │  │
│  │   :5174      │◄─┤   :8001      │◄─┤   Worker     │  │
│  └──────────────┘  └──────┬───────┘  └──────┬───────┘  │
│                           │                  │          │
│                   ┌───────▼────────┐ ┌──────▼───────┐  │
│                   │ postgres-test  │ │  redis-test  │  │
│                   │ (test_oj_e2e)  │ │   :6380      │  │
│                   └────────────────┘ └──────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## テストデータ

テスト環境では以下のテストデータが自動的に投入されます：

### テストユーザー

| ロール   | Email                | パスワード | 用途             |
| -------- | -------------------- | ---------- | ---------------- |
| Admin    | admin@example.com    | admin123   | 管理者テスト     |
| Teacher  | teacher@example.com  | teacher123 | 教師機能テスト   |
| Student  | student@example.com  | student123 | 学生機能テスト   |
| Student2 | student2@example.com | student123 | マルチユーザー   |

### テスト問題

- **P001: A+B Problem**（簡単）- 2つの整数の和を計算、3つのテストケース
- **P002: Hello World**（簡単）- "Hello, World!" を出力、1つのテストケース
- **P003: Factorial**（中級）- 階乗を計算、3つのテストケース

### テストコンテスト

- **E2E Test Contest**（開催中）- A+B Problem と Hello World を含む、参加・提出可能
- **Upcoming Contest**（開始前）- Factorial を含む、参加不可

## クイックスタート

### 1. 依存関係のインストール

```bash
cd frontend
npm install
```

### 2. Playwright ブラウザのインストール

```bash
# Chrome と Safari をインストール
npx playwright install chromium webkit
```

### 3. テスト環境の起動

```bash
# Docker Compose でテスト環境を起動
docker compose -f docker-compose.test.yml up -d

# サービスの準備を待つ（約30-60秒）
# 以下のコマンドでステータスを確認
docker compose -f docker-compose.test.yml ps
```

### 4. テストの実行

```bash
cd frontend

# すべての E2E テストを実行（環境の自動検出）
npm run test:e2e

# Chrome のみテスト
npx playwright test -c playwright.config.e2e.ts --project=chromium

# Safari のみテスト
npx playwright test -c playwright.config.e2e.ts --project=webkit

# 特定のテストファイルを実行
npx playwright test -c playwright.config.e2e.ts tests/e2e/auth.e2e.spec.ts

# 特定のテストケースを実行
npx playwright test -c playwright.config.e2e.ts --grep "should login"

# UI モード（デバッグ時推奨）
npm run test:e2e:ui

# デバッグモード
npm run test:e2e:debug

# テストレポートを表示
npx playwright show-report playwright-report-e2e
```

### 5. テスト環境の停止

```bash
# テスト環境を停止してクリーンアップ
docker compose -f docker-compose.test.yml down -v
```

## テスト環境の特徴

### スマート環境検出

テストフレームワークは環境状態を自動検出します：
- 環境が起動中の場合、すぐにテストを実行（高速）
- 環境が起動していない場合、Docker 環境を自動起動（ローカル開発）
- CI 環境では、事前起動されたサービスの準備を待機

### 環境の保持

デフォルトでは、テスト完了後も Docker 環境が保持されます：
- テストの素早い再実行
- 手動デバッグ

環境をクリーンアップするには：
```bash
# テスト後にクリーンアップ
E2E_CLEANUP=true npm run test:e2e

# または手動で停止
docker compose -f docker-compose.test.yml down -v
```

## テスト構造

```
frontend/
├── tests/
│   ├── e2e/                      # E2E テストファイル
│   │   ├── auth.e2e.spec.ts      # 認証テスト（17テストケース）
│   │   ├── problems.e2e.spec.ts  # 問題一覧テスト（8テストケース）
│   │   ├── submission.e2e.spec.ts# 提出テスト（10テストケース）
│   │   └── contest.e2e.spec.ts   # コンテストテスト
│   └── helpers/                  # テストユーティリティ
│       ├── auth.helper.ts        # 認証ヘルパー関数
│       ├── data.helper.ts        # テストデータ定数
│       ├── setup.ts              # グローバルセットアップ
│       └── teardown.ts           # グローバルティアダウン
├── playwright.config.e2e.ts      # Playwright E2E 設定
└── playwright-report-e2e/        # テストレポート出力ディレクトリ
```

## テストカバレッジ

### 認証テスト (auth.e2e.spec.ts) - 17テスト

#### 登録
- ✅ 新規ユーザー登録成功
- ✅ パスワード不一致でエラー表示
- ✅ メール重複でエラー表示

#### ログイン
- ✅ Student ログイン成功
- ✅ Teacher ログイン成功
- ✅ Admin ログイン成功
- ✅ 無効な認証情報でエラー表示
- ✅ 間違ったパスワードでエラー表示
- ✅ 空フィールドの処理

#### ログアウト
- ✅ ログアウト成功とログインページへリダイレクト

#### セッション管理
- ✅ ダッシュボードへの未認証アクセスをリダイレクト
- ✅ ページリロード後もセッション維持
- ✅ ログイン後にトークンを localStorage に保存
- ✅ ログアウト後にトークンをクリア

#### ナビゲーション
- ✅ ログインページから登録ページへ遷移
- ✅ 登録ページからログインページへ遷移
- ✅ 未認証で保護されたルートにアクセス時にリダイレクト

### 問題一覧テスト (problems.e2e.spec.ts) - 8テスト

- ✅ 問題一覧ページを表示
- ✅ A+B Problem を表示
- ✅ Hello World Problem を表示
- ✅ 難易度バッジを表示
- ✅ 問題クリックで詳細ページへ遷移
- ✅ ナビゲーションメニューから問題ページへアクセス
- ✅ テーブル形式で問題を表示
- ✅ 問題の時間・メモリ制限を表示

### 提出テスト (submission.e2e.spec.ts) - 10テスト

- ✅ 問題詳細ページを表示
- ✅ 問題説明とテストケースを表示
- ✅ コーディングタブを表示
- ✅ コード提出と結果確認
- ✅ 提出履歴を表示
- ✅ 提出をフィルタリング
- ✅ 提出ステータスを表示
- ✅ 提出ページから問題へ遷移
- ✅ 提出クリックで詳細を表示
- ✅ 問題へ遷移してコーディングインターフェースを表示

### コンテストテスト (contest.e2e.spec.ts)

- コンテスト一覧を表示
- コンテスト詳細ページ
- コンテストに参加
- コンテスト問題一覧

## CI/CD 統合

### GitHub Actions 設定

テストは以下の条件で自動トリガーされます：
- `main` / `develop` ブランチへのプッシュ
- `frontend/tests/e2e/**`、`frontend/src/services/**` などの変更

### テストフロー

CI でのテストフロー：
1. PostgreSQL と Redis を起動
2. Backend を起動してヘルスチェック
3. API 統合テストを実行
4. Frontend を起動
5. E2E テストを順次実行（Auth → Problems → Submission → Contest）
6. テストレポートをアップロード

### テストレポート Artifacts

| Artifact 名 | 内容 | 保持期間 |
|-------------|------|----------|
| `playwright-report-e2e` | HTML テストレポート | 30日 |
| `playwright-test-results` | スクリーンショット、動画、トレース | 14日（失敗時のみ）|

### 手動トリガー

GitHub Actions ページから手動でトリガーし、テストタイプを選択できます：
- `api-only` - API 統合テストのみ実行
- `e2e-only` - E2E テストのみ実行
- `all` - すべてのテストを実行

## 新しいテストの作成

`frontend/tests/e2e/` に新しいテストファイルを作成：

```typescript
import { test, expect } from "@playwright/test";
import { login, clearAuth } from "../helpers/auth.helper";
import { TEST_USERS } from "../helpers/data.helper";

test.describe("My Feature Tests", () => {
  // ログイン競合を避けるためシリアルモードを使用
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
    // 前回の認証状態をクリア
    await page.goto("/login");
    await clearAuth(page);
    // ログイン
    await login(page, "student");
  });

  test("should do something", async ({ page }) => {
    // テストロジック
  });
});
```

### ヘルパー関数の使用

```typescript
import { login, logout, clearAuth, isAuthenticated } from "../helpers/auth.helper";
import { TEST_USERS, TEST_PROBLEMS, TEST_CONTESTS } from "../helpers/data.helper";

// 異なるロールでログイン
await login(page, "student");
await login(page, "teacher");
await login(page, "admin");

// ログアウト
await logout(page);

// テストデータを使用
const user = TEST_USERS.student;  // { email, password, username, role }
const problem = TEST_PROBLEMS.aPlusB;  // { title, displayId, difficulty, slug }
```

## テストのデバッグ

```bash
# UI モード（推奨）- 視覚的なテスト実行
npm run test:e2e:ui

# デバッグモード - ステップ実行
npm run test:e2e:debug

# ブラウザウィンドウを表示
npx playwright test -c playwright.config.e2e.ts --headed

# 失敗したテストのトレースを表示
npx playwright show-trace test-results/xxx/trace.zip
```

## トラブルシューティング

### テスト環境の起動失敗

1. Docker が実行中か確認
2. ポート 5174 と 8001 が使用されていないか確認
3. サービスログを確認：
   ```bash
   docker compose -f docker-compose.test.yml logs backend-test
   ```

### テストデータが不正

テスト環境をリセット：
```bash
docker compose -f docker-compose.test.yml down -v
docker compose -f docker-compose.test.yml up -d
```

### ログインテストが失敗

正しいセレクターを使用していることを確認。User Menu ボタンの aria-label は「使用者選單」または「User Menu」です。

### API リクエスト失敗（400エラー）

Docker サービス名がハイフン（`-`）を使用していることを確認。例：`backend-test`（`backend_test` ではなく）。

### 複数のテストスイートを同時実行すると失敗

レート制限やセッション競合が原因かもしれません。推奨事項：
- `serial` モードを使用
- `beforeEach` で `clearAuth()` を呼び出す
- テストスイートを個別に実行

## ベストプラクティス

1. **データ分離**：テストユーザーにユニークなタイムスタンプを使用してデータ競合を回避
2. **待機戦略**：Playwright の自動待機を使用、`waitForTimeout` を避ける
3. **セレクター優先度**：
   - `getByRole`、`getByText` を優先
   - 次に `data-testid` を使用
   - 不安定な CSS クラスを避ける
4. **テスト独立性**：`beforeEach` で状態をクリア
5. **エラーハンドリング**：カバーされた要素には `force: true` を使用
6. **シリアルモード**：`test.describe.configure({ mode: "serial" })` で並列競合を回避

## 参考資料

- [Playwright 公式ドキュメント](https://playwright.dev/)
- [Docker Compose ドキュメント](https://docs.docker.com/compose/)
- [GitHub Actions ドキュメント](https://docs.github.com/en/actions)
