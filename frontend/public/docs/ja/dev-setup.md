# 開発環境セットアップ

このガイドでは、QJudge のローカル開発環境のセットアップ方法を説明します。

## システム要件

- Node.js 18+
- Python 3.10+
- Docker & Docker Compose
- Git

## クイックスタート

### 1. プロジェクトのクローン

```bash
git clone https://github.com/your-org/qjudge.git
cd qjudge
```

### 2. フロントエンドセットアップ

```bash
cd frontend
npm install
npm run dev
```

フロントエンドは `http://localhost:5173` で起動します。

### 3. バックエンドセットアップ

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

バックエンドは `http://localhost:8000` で起動します。

### 4. ジャッジシステム

ジャッジシステムは Docker で実行：

```bash
docker compose up -d judge
```

## プロジェクト構造

```
qjudge/
├── frontend/          # React フロントエンド
│   ├── src/
│   │   ├── domains/   # 機能モジュール
│   │   ├── ui/        # UI コンポーネント
│   │   └── i18n/      # 多言語対応
│   └── public/
├── backend/           # Django バックエンド
│   ├── api/           # API エンドポイント
│   ├── judge/         # ジャッジロジック
│   └── core/          # コアモジュール
└── docker/            # Docker 設定
```

## よく使うコマンド

### フロントエンド

| コマンド        | 説明                   |
| --------------- | ---------------------- |
| `npm run dev`   | 開発サーバーを起動     |
| `npm run build` | 本番用ビルド           |
| `npm run lint`  | コードスタイルチェック |
| `npm run test`  | テストを実行           |

### バックエンド

| コマンド                           | 説明                         |
| ---------------------------------- | ---------------------------- |
| `python manage.py runserver`       | 開発サーバーを起動           |
| `python manage.py migrate`         | データベースマイグレーション |
| `python manage.py test`            | テストを実行                 |
| `python manage.py createsuperuser` | 管理者アカウントを作成       |

## 環境変数

### フロントエンド (.env)

```
VITE_API_URL=http://localhost:8000
```

### バックエンド (.env)

```
DEBUG=True
SECRET_KEY=your-secret-key
DATABASE_URL=sqlite:///db.sqlite3
```

## よくある問題

### フロントエンドがバックエンドに接続できない

バックエンドが起動していることを確認し、CORS 設定を確認してください。

### データベースマイグレーションが失敗する

マイグレーションファイルを削除して再生成してみてください：

```bash
python manage.py makemigrations
python manage.py migrate
```

### Docker コンテナが起動しない

Docker サービスが実行中かどうかを確認：

```bash
docker ps
docker compose logs
```

