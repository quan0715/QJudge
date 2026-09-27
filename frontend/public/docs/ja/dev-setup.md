このガイドでは、QJudge のローカル開発環境を構築します。開発環境は本番用の `deploy/compose.yml` に `compose.dev.yml` を重ねたもので、ソースコードのマウント、ホットリロード、localhost のポート、同じ Compose プロジェクト内の MinIO を追加します。設定ファイルは本番と同じ `deploy/.env` です。本番サイトを構築する場合は[デプロイ](/docs/deployment)（繁体字中国語）を参照してください。

ローカル環境はこの 1 つだけです。データベースを使うバックエンドのテストと E2E は CI で実行します（第 6 節）。

## 1. 必要なツール

- Git
- Docker（Compose v2 を含む）
- Python 3（`deploy/qjudge check` の実行に使用）

Node.js と各サービスの Python パッケージはコンテナ内にあります。

## 2. コードの取得

```bash
git clone https://github.com/quan0715/QJudge.git
cd QJudge
```

## 3. `deploy/.env` の作成

```bash
cp deploy/.env.example deploy/.env
```

次の値を入力し、それ以外は空のままにします。

```text
QJUDGE_PUBLIC_ORIGIN=http://localhost:5173
COMPOSE_PROJECT_NAME=qjudge-dev
SECRET_KEY=<ランダムな文字列>
POSTGRES_ADMIN_PASSWORD=<ランダムな文字列>
DB_PASSWORD=<ランダムな文字列>
AI_DB_PASSWORD=<ランダムな文字列>
CREDENTIAL_LEASE_SECRET=<ランダムな文字列>
HOST_PROJECT_ROOT=<この checkout の絶対パス>
STORAGE_MODE=bundled
OBJECT_STORAGE_ENDPOINT_URL=http://minio:9000
OBJECT_STORAGE_PUBLIC_ENDPOINT_URL=http://localhost:9000
OBJECT_STORAGE_ACCESS_KEY=qjudge
OBJECT_STORAGE_SECRET_KEY=<8 文字以上のランダムな文字列>
OBJECT_STORAGE_BUCKET=qjudge
```

ランダムな文字列は `python3 -c 'import secrets; print(secrets.token_urlsafe(24))'` で生成できます。データベースのパスワードに使える文字は英数字と `-._~` のみです。`COMPOSE_PROJECT_NAME` はコンテナとボリュームの名前になるため、同じマシン上の checkout ごとに別の名前を付けてください。

設定を検証します。

```bash
deploy/qjudge check
```

`…/deploy/.env: OK` と表示されたら次に進みます。

## 4. サービスの起動

Compose のコマンドはすべてラッパー経由で実行します。ラッパーが正しい compose ファイルを選びます。初回は次のとおりです。

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev build
docker pull --platform linux/amd64 ghcr.io/quan0715/qjudge/judge:latest
deploy/qjudge secrets --image qjudge/backend:dev
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev up -d
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev run --rm storage-init
```

`deploy/qjudge secrets` は各サービスがマウントする AI OAuth と Integrity の鍵を `deploy/secrets/` に生成します。最初の `up` より前に存在している必要があり、既存の鍵はそのまま残ります。ジャッジワーカーは取得したジャッジイメージで提出を実行します。`storage-init` は MinIO に `OBJECT_STORAGE_BUCKET` を作成します。`backend` と `ai-service` は起動時にマイグレーションを適用します。

テスト用アカウントとサンプル問題が必要な場合：

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend python manage.py seed_e2e_data
```

状態を確認します。

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev ps
./scripts/dev/check-dev-services.sh
```

| サービス | URL |
| --- | --- |
| QJudge（Vite） | `http://localhost:5173` |
| Backend API | `http://localhost:8000` |
| AI Service | `http://localhost:8001`（`/health/live`、`/health/ready`） |
| Storybook | `http://localhost:6006`、または `http://localhost:5173/dev/storybook/` |
| MCP Server | `http://localhost:9002/mcp` |
| MinIO | API `http://localhost:9000`、コンソール `http://localhost:9001` |

PostgreSQL、PgBouncer、Redis は `127.0.0.1` のポート `5432`、`6432`、`6379` で待ち受けます。ポートが競合する場合は、ラッパーを実行するシェルで `DEV_FRONTEND_PORT` などの変数を設定します（名前は `compose.dev.yml` を参照）。これらを `deploy/.env` に書かないでください。`check` が未知のキーとして報告します。

`COMPOSE_PROFILES` には `tunnel`（`TUNNEL_TOKEN` が必要）や `live-monitoring`（Git 管理外の `.tmp/livekit/dev.json` を読む開発用 LiveKit）を追加できます。

## 5. コードの編集とログ

frontend、backend、ai-service のソースはコンテナにマウントされているため、ほとんどの変更は保存時に再読み込みされます。依存関係や Dockerfile を変更した場合は `dev up -d --build` を実行します。

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev logs -f frontend
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev logs -f backend
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev logs -f ai-service
```

`Ctrl+C` はログ表示を終了するだけで、サービスは停止しません。

## 6. テストの実行

Frontend：

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend npm run lint
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend npm run typecheck
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend npm run test
```

AI Service：

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T ai-service python -m pytest -q tests/unit
```

データベースを使わないバックエンドのテストは dev で実行できます。pytest-django はマークのないテストからのデータベースアクセスを拒否します。

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend \
  python -m pytest -q --ds=config.settings.test apps/ai/tests/test_start_run_serializer.py
```

ローカルにテスト用データベースはありません。データベースが必要なバックエンドのテストは CI の Backend Unit Tests と Judge Tests で実行され、統合テストと E2E は CI で新規インストールしたスタックに対して実行されます（[E2E テスト](/docs/e2e-testing)を参照）。

## 7. 停止と再開

```bash
.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev down
```

コンテナは削除されますが、データボリュームは残ります。`dev up -d` で再開できます。`down -v` は使わないでください。ローカルのデータベースと MinIO のデータが削除されます。

次は[コントリビューションガイド](/docs/contributing)でブランチ、テスト、ドキュメントのルールを確認してください。
