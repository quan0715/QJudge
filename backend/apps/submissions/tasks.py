"""
Celery tasks for submissions app.
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


@shared_task
def judge_submission(submission_id):
    """
    Task to judge a submission using Docker-based C++ execution
    """
    try:
        submission = Submission.objects.get(id=submission_id)
        submission.status = 'judging'
        submission.save()
        
        # Simulate judging delay
        time.sleep(1)
        
        # Get test cases
        test_cases = TestCase.objects.filter(problem=submission.problem).order_by('order')
        
        # Filter for test submissions
        if submission.is_test:
            test_cases = test_cases.filter(is_sample=True)
        
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
            SubmissionResult.objects.create(
                submission=submission,
                test_case=tc,
                status=status,
                exec_time=exec_time,
                memory_usage=memory,
                output=output[:1000],
                error_message=error_msg[:1000]
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
        
        # Update problem stats
        problem = submission.problem
        problem.submission_count += 1
        if submission.status == 'AC':
            problem.accepted_count += 1
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
