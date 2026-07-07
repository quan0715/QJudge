from rest_framework.throttling import UserRateThrottle


class ExamEventsThrottle(UserRateThrottle):
    scope = "exam_events"
