# 개발 환경 설정

이 가이드에서는 QJudge 로컬 개발 환경 설정 방법을 설명합니다.

## 시스템 요구 사항

- Node.js 18+
- Python 3.10+
- Docker & Docker Compose
- Git

## 빠른 시작

### 1. 프로젝트 복제

```bash
git clone https://github.com/your-org/qjudge.git
cd qjudge
```

### 2. 프론트엔드 설정

```bash
cd frontend
npm install
npm run dev
```

프론트엔드는 `http://localhost:5173`에서 시작됩니다.

### 3. 백엔드 설정

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

백엔드는 `http://localhost:8000`에서 시작됩니다.

### 4. 채점 시스템

채점 시스템은 Docker에서 실행:

```bash
docker compose up -d judge
```

## 프로젝트 구조

```
qjudge/
├── frontend/          # React 프론트엔드
│   ├── src/
│   │   ├── domains/   # 기능 모듈
│   │   ├── ui/        # UI 컴포넌트
│   │   └── i18n/      # 다국어 지원
│   └── public/
├── backend/           # Django 백엔드
│   ├── api/           # API 엔드포인트
│   ├── judge/         # 채점 로직
│   └── core/          # 코어 모듈
└── docker/            # Docker 설정
```

## 자주 사용하는 명령

### 프론트엔드

| 명령            | 설명             |
| --------------- | ---------------- |
| `npm run dev`   | 개발 서버 시작   |
| `npm run build` | 프로덕션 빌드    |
| `npm run lint`  | 코드 스타일 검사 |
| `npm run test`  | 테스트 실행      |

### 백엔드

| 명령                               | 설명                      |
| ---------------------------------- | ------------------------- |
| `python manage.py runserver`       | 개발 서버 시작            |
| `python manage.py migrate`         | 데이터베이스 마이그레이션 |
| `python manage.py test`            | 테스트 실행               |
| `python manage.py createsuperuser` | 관리자 계정 생성          |

## 환경 변수

### 프론트엔드 (.env)

```
VITE_API_URL=http://localhost:8000
```

### 백엔드 (.env)

```
DEBUG=True
SECRET_KEY=your-secret-key
DATABASE_URL=sqlite:///db.sqlite3
```

## 자주 발생하는 문제

### 프론트엔드가 백엔드에 연결할 수 없음

백엔드가 실행 중인지 확인하고 CORS 설정을 확인하세요.

### 데이터베이스 마이그레이션 실패

마이그레이션 파일을 삭제하고 다시 생성해 보세요:

```bash
python manage.py makemigrations
python manage.py migrate
```

### Docker 컨테이너가 시작되지 않음

Docker 서비스가 실행 중인지 확인:

```bash
docker ps
docker compose logs
```

