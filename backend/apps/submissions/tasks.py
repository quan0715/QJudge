"""
Celery tasks for submissions app.
Supports priority queues:
- high_priority: Contest submissions (processed first)
- default: Practice submissions
"""
import time
from celery import shared_task
from django.utils import timezone
from .models import Submission, SubmissionResult
from apps.problems.models import TestCase

# Try to import CppJudge, fall back to mock if not available
try:
    from apps.judge.docker_runner import CppJudge
    USE_REAL_JUDGE = True
except ImportError:
    USE_REAL_JUDGE = False
    print("Warning: CppJudge not available, using mock judging")


class MockTestCase:
    def __init__(self, data, order):
        self.input_data = data.get('input', '')
        self.output_data = data.get('output', '')
        self.score = 0
        self.is_sample = False
        self.is_hidden = False
        self.id = f"custom_{order}"
        self.order = order


@shared_task(queue='high_priority')
def judge_contest_submission(submission_id):
    """
    High priority task to judge contest submissions.
    Uses the high_priority queue for faster processing.
    """
    return _judge_submission_impl(submission_id)


@shared_task(queue='default')
def judge_submission(submission_id):
    """
    Default priority task to judge practice submissions.
    Uses the default queue.
    """
    return _judge_submission_impl(submission_id)


def _judge_submission_impl(submission_id):
    """
    Internal implementation of submission judging using Docker-based execution.
    Shared by both high_priority and default queue tasks.
    """
    try:
        submission = Submission.objects.get(id=submission_id)
        # ... (rest of function)
        
        # Filter for test submissions
        test_cases = []
        if submission.is_test:
            # Start with sample test cases
            sample_cases = list(submission.problem.test_cases.filter(is_sample=True))
            
            custom_cases = []
            if submission.custom_test_cases:
                custom_cases = [
                    MockTestCase(data, idx + 1000) # Offset order to avoid collision
                    for idx, data in enumerate(submission.custom_test_cases)
                ]
            
            # Combine them: Samples first, then Custom
            test_cases = sample_cases + custom_cases
        else:
            # For normal submissions, use all test cases
            test_cases = list(submission.problem.test_cases.all())
        
        total_score = 0
        max_exec_time = 0
        max_memory = 0
        is_accepted = True
        final_status = 'AC'
        
        # Initialize judge
        if USE_REAL_JUDGE:
            from apps.judge.judge_factory import get_judge
            try:
                judge = get_judge(submission.language)
            except ValueError:
                # Fallback or error if language not supported
                submission.status = 'SE'
                submission.error_message = f"Unsupported language: {submission.language}"
                submission.save()
                return f"Submission {submission_id} failed: Unsupported language"
        
        for tc in test_cases:
            if USE_REAL_JUDGE:
                # Real Docker execution
                result = judge.execute(
                    code=submission.code,
                    input_data=tc.input_data,
                    expected_output=tc.output_data,
                    time_limit=submission.problem.time_limit,
                    memory_limit=submission.problem.memory_limit
                )
                
                status = result['status']
                exec_time = result['time']
                memory = result['memory']
                output = result['output']
                error_msg = result['error']
            else:
                # Mock judging (fallback)
                import random
                if "compile_error" in submission.code.lower():
                    status = 'CE'
                    error_msg = "Compilation error"
                elif "runtime_error" in submission.code.lower():
                    status = 'RE'
                    error_msg = "Runtime error"
                elif "timeout" in submission.code.lower():
                    status = 'TLE'
                    error_msg = "Time limit exceeded"
                else:
                    status = 'AC'
                    error_msg = ""
                
                exec_time = random.randint(10, 100)
                memory = random.randint(1024, 10240)
                output = "Mock output"
            
            # Update stats
            max_exec_time = max(max_exec_time, exec_time)
            max_memory = max(max_memory, memory)
            
            # Calculate score
            if status == 'AC':
                total_score += tc.score
            else:
                is_accepted = False
                if final_status == 'AC':  # First error
                    final_status = status
            
            # Save result
            # For custom test cases (MockTestCase), they don't have a DB ID, so test_case will be None
            tc_instance = None
            if isinstance(tc, TestCase):
                 tc_instance = tc
            
            SubmissionResult.objects.create(
                submission=submission,
                test_case=tc_instance,
                status=status,
                exec_time=exec_time,
                memory_usage=memory,
                output=output[:1000],
                error_message=error_msg[:1000],
                input_data=tc.input_data[:2000],  # Save snapshot of input
                expected_output=tc.output_data[:2000] # Save snapshot of expected output
            )
            
            # If CE or SE, stop testing other cases
            if status in ['CE', 'SE']:
                final_status = status
                # Save the error message to the submission itself for easy access
                submission.error_message = error_msg
                break
        
        # Update submission
        submission.status = final_status
        submission.score = total_score
        submission.exec_time = max_exec_time
        submission.memory_usage = max_memory
        submission.save()
        
        # Update statistics
        try:
            submission.user.profile.update_statistics()
        except:
            pass
        
        # Update problem stats (only for official submissions, not test runs)
        if not submission.is_test:
            problem = submission.problem
            problem.submission_count += 1
            # Update status-specific counts
            status = submission.status
            if status == 'AC':
                problem.accepted_count += 1
            elif status == 'WA':
                problem.wa_count += 1
            elif status == 'TLE':
                problem.tle_count += 1
            elif status == 'MLE':
                problem.mle_count += 1
            elif status == 'RE':
                problem.re_count += 1
            elif status == 'CE':
                problem.ce_count += 1
            problem.save()
        
        return f"Submission {submission_id} judged: {submission.status}"
        
    except Submission.DoesNotExist:
        return f"Submission {submission_id} not found"
    except Exception as e:
        if 'submission' in locals():
            submission.status = 'SE'
            submission.error_message = str(e)
            submission.save()
        return f"Error judging submission {submission_id}: {str(e)}"
