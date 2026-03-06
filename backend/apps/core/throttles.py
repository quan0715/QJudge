from rest_framework.throttling import UserRateThrottle


class ExamEventsThrottle(UserRateThrottle):
    scope = "exam_events"


class ExamAnticheatUrlsThrottle(UserRateThrottle):
    scope = "exam_anticheat_urls"
