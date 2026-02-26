from rest_framework.throttling import UserRateThrottle


class ExamHeartbeatThrottle(UserRateThrottle):
    scope = "exam_heartbeat"


class ExamEventsThrottle(UserRateThrottle):
    scope = "exam_events"
