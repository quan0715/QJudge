E2E と API 統合テストは、通常のインストール手順でゼロから構築した QJudge に対して CI で実行します。Playwright と Vitest は runner 上で直接実行し、frontend（`http://localhost:8080`）に接続します。

## CI での実行場所

| Workflow | タイミング | 内容 |
| --- | --- | --- |
| `ci.yml` の Integration Tests | すべての CI 実行 | `npm run test:api` と MCP Server の統合テスト |
| `e2e.yml` | `main` 向けのすべての pull request、または手動実行 | pull request では auth と coding を実行。手動実行では任意のグループ（auth、exam、contest、coding、settings）と grep を指定可能 |

各 job は最初に `ci/e2e-stack.sh` を実行します。

1. `deploy/qjudge init --non-interactive`：origin は `http://localhost:8080`、bundled storage、公開 storage URL は `http://minio:9000`（runner は `/etc/hosts` で `minio` を `127.0.0.1` に向けます）。
2. `deploy/qjudge addon storage up` と `init` の後、`deploy/qjudge upgrade` で現在の commit をインストールします。
3. `ci/compose.e2e.yml` を重ねて再起動します。Django は `config.settings.test`、Celery は非同期実行、AI サービスは fake adapters に接続します。
4. `seed_e2e_data` が `admin`、`teacher`、`student`、`student2` のアカウントとサンプルの問題・コンテストを作成します。テスト用の認証情報は `frontend/tests/helpers/data.helper.ts` にあります。

スクリプトはこのスタックの compose コマンドを `$QJ_DC` に保存し、CI はそれを使ってサービスのログを収集し artifact としてアップロードします。

## ローカルでの実行

ローカルで実行する場合は、同じスクリプトを別の git worktree と Compose プロジェクトで使います。checkout の `deploy/.env` と dev のデータには影響しません。

```bash
git worktree add --detach ../qjudge-e2e HEAD
../qjudge-e2e/ci/e2e-stack.sh --set COMPOSE_PROJECT_NAME=qjudge-e2e
```

- 追加の `--set KEY=VALUE` は `deploy/qjudge init` に渡され、スクリプトのデフォルトを上書きします。
- Bundled storage はポート `9000`／`9001` を使い、dev の MinIO と競合します。先に `qjudge-dc.sh dev stop` を実行するか、`--set STORAGE_MODE=external` とほかの `OBJECT_STORAGE_*` で別の S3 互換サービスを使ってください（bucket は作成済みで、CORS が `http://localhost:8080` を許可している必要があります）。
- Bundled storage を使う場合、ブラウザが `minio` を解決できるよう `/etc/hosts` に `127.0.0.1 minio` を追加します。

スクリプトは最後にこのスタックの compose コマンドを表示します。ログの確認に使えます。続いて worktree の `frontend/` でテストを実行します。

```bash
cd ../qjudge-e2e/frontend
npm ci
npx playwright install chromium
npm run test:e2e -- tests/e2e/auth.e2e.spec.ts
npm run test:api
```

デバッグには `npm run test:e2e:ui`、`test:e2e:debug`、`test:e2e:report` を使います。接続先は `PLAYWRIGHT_BASE_URL` と `API_BASE_URL` で上書きできます。

終わったらこのプロジェクトだけを削除します（dev には `-v` を使わないでください）。

```bash
docker compose -p qjudge-e2e down -v
docker compose -p qjudge-e2e-storage down -v
git worktree remove --force ../qjudge-e2e
```

`upgrade` がビルドした `qjudge/*:sha-*` イメージはマシンに残ります。不要になったら `docker image rm` で削除してください。

## テストの作成

テストは `frontend/tests/e2e/` に、ログイン・データ・試験フローの共通ヘルパーは `frontend/tests/helpers/` に置きます。新しいテストは必要なクラス、問題、試験を自分で作成して終了時に削除し、ほかのテストが残したデータに依存しないようにしてください。
