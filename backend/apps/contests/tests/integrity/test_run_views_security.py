from apps.contests.services.integrity_runs import InvalidRunTransition
from apps.contests.views.integrity_runs import IntegrityRunViewSet


def test_transition_response_does_not_expose_exception_details():
    def fail_transition():
        raise InvalidRunTransition("internal transition state: secret")

    response = IntegrityRunViewSet._transition_response(fail_transition)

    assert response.status_code == 409
    assert response.data == {
        "code": "invalid_integrity_run_transition",
        "detail": "Integrity run cannot perform the requested transition.",
    }
    assert "secret" not in str(response.data)
