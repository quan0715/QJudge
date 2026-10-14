"""
Celery tasks for submissions app.
Supports priority queues via apply_async(queue=...):
- high_priority: Contest submissions (processed first)
- default: Practice submissions
"""
import logging
from celery import shared_task
from django.db.models import F
from .models import Submission, SubmissionResult
from apps.problems.models import CodingProblem, TestCase
from apps.judge.judge_factory import get_judge

logger = logging.getLogger(__name__)


def _resolve_test_case_weight(tc: TestCase) -> int:
    weight_percent = getattr(tc, "weight_percent", None)
    if weight_percent is not None:
        return max(0, int(weight_percent))
    return max(0, int(getattr(tc, "score", 0) or 0))


@shared_task
def judge_submission(submission_id):
    """
    Judge a submission. Queue is determined by the caller via apply_async(queue=...).
    """
    try:
        submission = Submission.objects.get(id=submission_id)
    except Submission.DoesNotExist:
        return f"Submission {submission_id} not found"

    try:
        Submission.objects.filter(pk=submission.pk, status="pending").update(status="judging")
        test_cases = list(submission.problem.test_cases.all())

        legacy_total_score = 0
        passed_weight_sum = 0
        total_weight_sum = sum(_resolve_test_case_weight(tc) for tc in test_cases)
        has_weight_percent = any(tc.weight_percent is not None for tc in test_cases)
        max_exec_time = 0
        max_memory = 0
        final_status = 'AC'
        
        # Initialize judge
        try:
            judge = get_judge(submission.language)
        except ValueError:
            submission.status = 'SE'
            submission.error_message = f"Unsupported language: {submission.language}"
            submission.save()
            return f"Submission {submission_id} failed: Unsupported language"
        
        with judge:
            for tc in test_cases:
                result = judge.execute(
                    code=submission.code,
                    input_data=tc.input_data,
                    expected_output=tc.output_data,
                    time_limit=submission.problem.time_limit,
                    memory_limit=submission.problem.memory_limit,
                )

                status = result['status']
                exec_time = result['time']
                memory = result['memory']
                output = result['output']
                error_msg = result['error']
            
                # Update stats
                max_exec_time = max(max_exec_time, exec_time)
                max_memory = max(max_memory, memory)
            
                # Calculate score
                tc_weight = _resolve_test_case_weight(tc)
                if status == 'AC':
                    legacy_total_score += tc.score
                    passed_weight_sum += tc_weight
                elif final_status == 'AC':  # First error
                    final_status = status
            
                SubmissionResult.objects.create(
                    submission=submission,
                    test_case=tc,
                    status=status,
                    exec_time=exec_time,
                    memory_usage=memory,
                    output=output[:1000],
                    error_message=error_msg[:1000],
                    input_data=tc.input_data[:2000],  # Save snapshot of input
                    expected_output=tc.output_data[:2000],
                    is_hidden=tc.is_hidden,
                )
            
                # If CE or SE, stop testing other cases
                if status in ['CE', 'SE']:
                    final_status = status
                    # Save the error message to the submission itself for easy access
                    submission.error_message = error_msg
                    break
        
        # Calculate final score
        total_score = legacy_total_score
        binding = submission.contest_question_binding
        if submission.source_type == 'contest' and binding:
            if total_weight_sum > 0:
                total_score = round(binding.score * (passed_weight_sum / total_weight_sum))
            elif final_status == 'AC':
                total_score = binding.score
            else:
                total_score = 0
        elif has_weight_percent:
            if total_weight_sum > 0:
                total_score = round(100 * (passed_weight_sum / total_weight_sum))
            else:
                total_score = 100 if final_status == 'AC' else 0

        # Update submission
        submission.status = final_status
        submission.score = 0 if final_status == 'SE' else total_score
        submission.exec_time = max_exec_time
        submission.memory_usage = max_memory
        submission.save()
        
        # Update statistics
        try:
            submission.user.profile.update_statistics()
        except Exception:
            logger.debug(
                "Failed to update profile statistics for submission_id=%s",
                submission_id,
                exc_info=True,
            )
        
        if final_status != 'SE':
            counts = {"submission_count": F("submission_count") + 1}
            status_field = {
                "AC": "accepted_count", "WA": "wa_count", "TLE": "tle_count",
                "MLE": "mle_count", "RE": "re_count", "CE": "ce_count",
            }.get(submission.status)
            if status_field:
                counts[status_field] = F(status_field) + 1
            CodingProblem.objects.filter(pk=submission.problem_id).update(**counts)
        
        return f"Submission {submission_id} judged: {submission.status}"

    except Exception:
        logger.exception("Error judging submission_id=%s", submission_id)
        submission.status = 'SE'
        submission.error_message = "Judge internal error"
        submission.save()
        return f"Error judging submission {submission_id}"
