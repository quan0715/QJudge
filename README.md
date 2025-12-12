# QJudge - 線上程式評測平台

QJudge 是一個現代化的線上評測系統（Online Judge），提供完整的程式競賽與教學功能。

## 連結

| 項目             | 網址                                                           |
| ---------------- | -------------------------------------------------------------- |
| **線上平台**     | [q-judge.quan.wtf](https://q-judge.quan.wtf)                   |
| **使用說明**     | [q-judge.quan.wtf/docs](https://q-judge.quan.wtf/docs)         |
| **GitHub Pages** | [quan0715.github.io/QJudge](https://quan0715.github.io/QJudge/#/docs/overview) |

## 技術棧

| 層級       | 技術                                    |
| ---------- | --------------------------------------- |
| Frontend   | React, TypeScript, Carbon Design System |
| Backend    | Django, Django REST Framework           |
| Database   | PostgreSQL, Redis                       |
| Task Queue | Celery                                  |
| Judge      | Docker Container Isolation              |
| Deployment | Docker Compose, GitHub Actions          |

## 快速開始

詳細的使用說明與開發指南請參閱 [使用說明文檔](https://q-judge.quan.wtf/docs)。

### 本地開發

```bash
# Backend
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements/dev.txt
python manage.py migrate
python manage.py runserver

# Frontend
cd frontend
npm install
npm run dev
```

## 授權

MIT License
