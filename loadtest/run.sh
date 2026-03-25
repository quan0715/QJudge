#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_BASE="-f $ROOT_DIR/docker-compose.test.yml -f $ROOT_DIR/loadtest/docker-compose.loadtest.yml"
LOADTEST_DIR="$ROOT_DIR/loadtest"
ARTIFACT_DIR="$LOADTEST_DIR/artifacts"

DC() {
  docker compose -f "$ROOT_DIR/docker-compose.test.yml" -f "$ROOT_DIR/loadtest/docker-compose.loadtest.yml" "$@"
}

BACKEND_TEST_SERVICE="${BACKEND_TEST_SERVICE:-backend-test}"
LOCUST_HOST="${LOCUST_HOST:-http://localhost:8002}"
LOCUST_USERS="${LOCUST_USERS:-50}"
LOCUST_SPAWN_RATE="${LOCUST_SPAWN_RATE:-5}"
LOCUST_RUN_TIME="${LOCUST_RUN_TIME:-3m}"
LT_CONTEST_NAME_DEFAULT="${LT_CONTEST_NAME:-Load Test Exam}"

usage() {
  cat <<EOF
Usage:
  ./loadtest/run.sh <command>

Commands:
  up                Start loadtest stack (build images)
  down              Stop loadtest stack
  down-v            Stop stack and remove volumes
  seed              Seed loadtest users/contests data
  reset             Reset participant status + runtime artifacts
  prepare           up + seed
  run-paper         Run paper exam loadtest (auto-save + contest fetch)
  run-coding        Run coding contest loadtest (/submissions/)
  run-burst         Run burst-start + burst-submit + burst-end
  full-paper        prepare + run-paper + down
  full-coding       prepare + run-coding + down
  full-burst        prepare + run-burst + down
  status            Show compose service status
  logs              Tail backend/celery/pgbouncer logs

Env knobs:
  LOCUST_HOST, LOCUST_USERS, LOCUST_SPAWN_RATE, LOCUST_RUN_TIME
  LT_CONTEST_NAME, LT_ALLOW_HIGH_RISK_BURST
  ANTICHEAT_S3_PUBLIC_ENDPOINT_URL
EOF
}

require_locust() {
  if ! command -v locust >/dev/null 2>&1; then
    echo "locust command not found. Install deps first:"
    echo "  pip install -r loadtest/requirements.txt"
    exit 1
  fi
}

timestamp() {
  date +"%Y%m%d-%H%M%S"
}

run_locust() {
  local scenario="$1"
  local file="$2"
  local ts out_prefix html_report
  ts="$(timestamp)"
  mkdir -p "$ARTIFACT_DIR"
  out_prefix="$ARTIFACT_DIR/${scenario}-${ts}"
  html_report="${out_prefix}.html"

  echo "[loadtest] scenario=$scenario file=$file host=$LOCUST_HOST users=$LOCUST_USERS spawn_rate=$LOCUST_SPAWN_RATE runtime=$LOCUST_RUN_TIME"
  (
    cd "$LOADTEST_DIR"
    LT_CONTEST_NAME="${LT_CONTEST_NAME_DEFAULT}" \
      locust -f "$file" \
      --users "$LOCUST_USERS" \
      --spawn-rate "$LOCUST_SPAWN_RATE" \
      --run-time "$LOCUST_RUN_TIME" \
      --headless \
      --host "$LOCUST_HOST" \
      --csv "$out_prefix" \
      --html "$html_report"
  )

  echo "[loadtest] reports:"
  echo "  ${out_prefix}_stats.csv"
  echo "  ${out_prefix}_failures.csv"
  echo "  ${out_prefix}_exceptions.csv"
  echo "  ${html_report}"
}

reset_runtime_data() {
  DC exec -T "$BACKEND_TEST_SERVICE" python manage.py shell -c "
from apps.contests.models import ContestParticipant, Contest
from apps.contests.models.exam import ExamEvent
from apps.contests.models.exam_answer import ExamAnswer
from apps.judge.models import Submission

contest_names = ['Load Test Exam', 'Load Test Coding']
for name in contest_names:
    contest = Contest.objects.filter(name=name).first()
    if not contest:
        print(f'skip: contest not found: {name}')
        continue
    participants = ContestParticipant.objects.filter(contest=contest)
    participants.update(
        exam_status='not_started',
        violation_count=0,
        started_at=None,
        left_at=None,
        locked_at=None,
        lock_reason='',
        submit_reason='',
    )
    ExamEvent.objects.filter(contest=contest).delete()
    ExamAnswer.objects.filter(participant__contest=contest).delete()
    Submission.objects.filter(contest=contest).delete()
    print(f'reset: {name}, participants={participants.count()}')
print('runtime reset done')
"
}

command="${1:-}"
if [[ -z "$command" ]]; then
  usage
  exit 1
fi

case "$command" in
  up)
    echo "[loadtest] docker compose $COMPOSE_BASE up -d --build"
    DC up -d --build
    ;;
  down)
    echo "[loadtest] docker compose $COMPOSE_BASE down"
    DC down
    ;;
  down-v)
    echo "[loadtest] docker compose $COMPOSE_BASE down -v"
    DC down -v
    ;;
  seed)
    DC exec -T "$BACKEND_TEST_SERVICE" python manage.py seed_loadtest_data
    ;;
  reset)
    reset_runtime_data
    ;;
  prepare)
    "$0" up
    "$0" seed
    ;;
  run-paper)
    require_locust
    run_locust "paper-exam" "locust_paper_exam.py"
    ;;
  run-coding)
    require_locust
    run_locust "coding-exam" "locustfile.py"
    ;;
  run-burst)
    require_locust
    export LT_ALLOW_HIGH_RISK_BURST="${LT_ALLOW_HIGH_RISK_BURST:-1}"
    echo "[loadtest] running burst scenarios (start/submit/end)"
    (
      cd "$LOADTEST_DIR"
      locust -f locust_burst_start.py --users "${LOCUST_USERS:-200}" --spawn-rate "${LOCUST_SPAWN_RATE:-200}" --run-time "${LOCUST_RUN_TIME:-30s}" --headless --host "$LOCUST_HOST"
      locust -f locust_burst_submit.py --users "${LOCUST_USERS:-200}" --spawn-rate "${LOCUST_SPAWN_RATE:-200}" --run-time "${LOCUST_RUN_TIME:-30s}" --headless --host "$LOCUST_HOST"
      locust -f locust_burst_end.py --users "${LOCUST_USERS:-200}" --spawn-rate "${LOCUST_SPAWN_RATE:-200}" --run-time "${LOCUST_RUN_TIME:-30s}" --headless --host "$LOCUST_HOST"
    )
    ;;
  full-paper)
    "$0" prepare
    "$0" run-paper
    "$0" down
    ;;
  full-coding)
    "$0" prepare
    "$0" run-coding
    "$0" down
    ;;
  full-burst)
    "$0" prepare
    "$0" run-burst
    "$0" down
    ;;
  status)
    DC ps
    ;;
  logs)
    DC logs -f --tail=200 backend-test celery-test celery-video-test pgbouncer-test
    ;;
  *)
    usage
    exit 1
    ;;
esac
