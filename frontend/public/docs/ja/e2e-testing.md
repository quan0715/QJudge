# E2E テストガイド

このドキュメントでは、フロントエンド E2E テストの設定と実行方法について説明します。

## 概要

このプロジェクトでは、Playwright を使用してエンドツーエンド（E2E）テストを行います。Docker Compose で完全なテスト環境を提供します：

- 独立したテストデータベース（PostgreSQL）
- テスト用 Redis
- Django バックエンドテストサービス
- Celery Worker（提出処理用）
- React フロントエンドテストサービス
- 事前注入されたテストデータ

## アーキテクチャ

```
┌─────────────────────────────────────────────────────────┐
│                    Playwright テスト                     │
│                   (localhost:5174)                       │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│              Docker Compose テスト環境                   │
├─────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │   Frontend   │  │   Backend    │  │   Celery     │  │
│  │   :5174      │◄─┤   :8001      │◄─┤   Worker     │  │
│  └──────────────┘  └──────┬───────┘  └──────┬───────┘  │
│                           │                  │          │
│                   ┌───────▼────────┐ ┌──────▼───────┐  │
│                   │   PostgreSQL   │ │    Redis     │  │
│                   │   (test_oj_e2e)│ │   :6380      │  │
│                   └────────────────┘ └──────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## テストデータ

テスト環境には以下のテストデータが自動的に注入されます：

### テストユーザー

| 役割     | Email                | パスワード | 用途                 |
| -------- | -------------------- | ---------- | -------------------- |
| Admin    | admin@example.com    | admin123   | 管理者テスト         |
| Teacher  | teacher@example.com  | teacher123 | 教師機能テスト       |
| Student  | student@example.com  | student123 | 学生テスト           |
| Student2 | student2@example.com | student123 | マルチユーザーテスト |

### テスト問題

- **P001: A+B Problem** (簡単) - 2 つの整数の和を計算、3 つのテストケース
- **P002: Hello World** (簡単) - "Hello, World!"を出力、1 つのテストケース
- **P003: Factorial** (中級) - 階乗を計算、3 つのテストケース

### テストコンテスト

- **E2E Test Contest** (進行中) - A+B Problem と Hello World を含む、参加と提出が可能
- **Upcoming Contest** (開始前) - Factorial を含む、まだ参加不可

## クイックスタート

### 1. 依存関係のインストール

```bash
cd frontend
npm install
```

### 2. Playwright ブラウザのインストール

```bash
npx playwright install
```

### 3. テスト環境の起動

管理スクリプトを使用して完全な E2E テスト環境を起動します：

```bash
# 方法 1: 管理スクリプトを使用（推奨）
./frontend/scripts/e2e-env.sh start

# 方法 2: Docker Compose を直接使用
docker-compose -f docker-compose.test.yml up -d
```

サービスが起動するまで待機（約 1-2 分）、スクリプトは自動的にサービスの準備完了を待ちます。

### 4. テストの実行

```bash
cd frontend

# すべての E2E テストを実行
npm run test:e2e

# UI モードで実行
npm run test:e2e:ui

# デバッグモード
npm run test:e2e:debug

# ヘッド付きブラウザで実行
npm run test:e2e:headed

# テストレポートを表示
npm run test:e2e:report
```

### 5. テスト環境の停止

```bash
# 管理スクリプトを使用
./frontend/scripts/e2e-env.sh stop

# または Docker Compose を使用
docker-compose -f docker-compose.test.yml down -v
```

## 管理スクリプトの使用方法

`frontend/scripts/e2e-env.sh` は以下のコマンドを提供します：

```bash
# 環境を起動
./frontend/scripts/e2e-env.sh start

# 環境を停止
./frontend/scripts/e2e-env.sh stop

# 環境をリセット（テストデータを再作成）
./frontend/scripts/e2e-env.sh reset

# サービス状態を確認
./frontend/scripts/e2e-env.sh status

# ログを表示
./frontend/scripts/e2e-env.sh logs                # すべてのサービス
./frontend/scripts/e2e-env.sh logs backend_test   # 特定のサービス

# コンテナ内でコマンドを実行
./frontend/scripts/e2e-env.sh exec backend_test python manage.py shell

# ヘルプを表示
./frontend/scripts/e2e-env.sh help
```

## テスト構造

```
frontend/
├── tests/
│   ├── e2e/                      # E2E テストファイル
│   │   ├── auth.e2e.spec.ts      # 認証テスト
│   │   ├── problems.e2e.spec.ts  # 問題リストテスト
│   │   ├── submission.e2e.spec.ts# 提出テスト
│   │   └── contest.e2e.spec.ts   # コンテストテスト
│   └── helpers/                  # テストユーティリティ
│       ├── auth.helper.ts        # 認証ヘルパー関数
│       ├── data.helper.ts        # テストデータ定数
│       ├── setup.ts              # グローバルセットアップ
│       └── teardown.ts           # グローバルティアダウン
├── playwright.config.e2e.ts      # Playwright E2E 設定
└── scripts/
    └── e2e-env.sh                # 環境管理スクリプト
```

## テストカバレッジ

### 認証テスト (auth.e2e.spec.ts)

- ユーザー登録
- ユーザーログイン（Student, Teacher, Admin）
- ユーザーログアウト
- 無効な認証情報のエラー処理
- 未認証アクセス保護
- セッション永続化

### 問題リストテスト (problems.e2e.spec.ts)

- 問題リストの表示
- 問題情報の表示（タイトル、難易度、番号）
- 問題をクリックして詳細を表示
- ページネーション
- ナビゲーション

### 提出テスト (submission.e2e.spec.ts)

- 問題詳細の表示
- 問題説明とテストケース
- コードエディター
- コード提出
- 提出結果の表示
- 提出履歴
- 提出フィルタリング

### コンテストテスト (contest.e2e.spec.ts)

- コンテストリストの表示
- コンテストステータス表示
- コンテスト詳細ページ
- コンテストへの参加
- コンテスト問題リスト
- コンテスト中の問題解決
- コンテストリーダーボード
- 時間制限チェック

## 新しいテストの作成

`frontend/tests/e2e/` に新しいテストファイルを作成します：

```typescript
import { test, expect } from "@playwright/test";
import { login } from "../helpers/auth.helper";

test.describe("My Feature Tests", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, "student");
  });

  test("should do something", async ({ page }) => {
    // テストロジック
  });
});
```

ヘルパー関数の使用：

```typescript
import { login, logout } from "../helpers/auth.helper";
import { TEST_USERS, TEST_PROBLEMS } from "../helpers/data.helper";

// ログイン
await login(page, "student");

// テストデータを使用
const user = TEST_USERS.student;
const problem = TEST_PROBLEMS.aPlusB;
```

## テストのデバッグ

```bash
# UI モード（推奨）
npm run test:e2e:ui

# デバッグモード
npm run test:e2e:debug

# 特定のテストファイルを実行
npx playwright test -c playwright.config.e2e.ts tests/e2e/auth.e2e.spec.ts

# 特定のテストケースを実行
npx playwright test -c playwright.config.e2e.ts -g "should login as student"
```

## よくある質問

### テスト環境が起動に失敗する

以下を確認してください：

1. Docker は動作していますか？
2. ポート 5174 と 8001 は使用可能ですか？
3. サービスログを確認：`./frontend/scripts/e2e-env.sh logs`

### テストデータが正しくない

テスト環境をリセット：

```bash
./frontend/scripts/e2e-env.sh reset
```

### テストが遅い

1. Docker に十分なリソースがあることを確認
2. `--workers=1` を使用して並列テストを避ける
3. UI ログインの代わりに API ログインを検討（より高速）

### CI/CD でテストを実行する方法

```bash
# CI 環境変数を設定
export CI=true

# 環境を起動
./frontend/scripts/e2e-env.sh start

# テストを実行
cd frontend && npm run test:e2e

# クリーンアップ
cd .. && ./frontend/scripts/e2e-env.sh stop
```

## ベストプラクティス

1. **データ分離**：各テスト実行前に環境をリセットし、テストの独立性を確保
2. **待機戦略**：Playwright の自動待機を使用、`waitForTimeout` を避ける
3. **セレクターの優先順位**：
   - `data-testid` を優先
   - 次にセマンティックセレクター（role, text）
   - CSS クラスを避ける（変更されやすい）
4. **テストの独立性**：各テストは他のテストに依存せず独立して実行できるべき
5. **状態のクリーンアップ**：`beforeEach` で認証状態をクリア

## パフォーマンス最適化

1. **API ログインを使用**：ログインフローをテストしない場合、`loginViaAPI()` を使用して高速化
2. **待機時間の削減**：Playwright の自動待機メカニズムを活用
3. **並列実行**：慎重に使用、テストデータの競合がないことを確認
4. **スナップショットテスト**：安定した UI には視覚的スナップショットテストを検討

## メンテナンス

### テストデータの更新

`backend/apps/core/management/commands/seed_e2e_data.py` を修正してテストデータ構造を更新。

### テスト設定の更新

`frontend/playwright.config.e2e.ts` を修正してテスト動作を調整（タイムアウト、リトライ回数など）。

### 環境設定の更新

`docker-compose.test.yml` を修正してサービス設定を調整（ポート、環境変数など）。

## 参考資料

- [Playwright ドキュメント](https://playwright.dev/)
- [Docker Compose ドキュメント](https://docs.docker.com/compose/)
- [Django テストベストプラクティス](https://docs.djangoproject.com/en/stable/topics/testing/)
