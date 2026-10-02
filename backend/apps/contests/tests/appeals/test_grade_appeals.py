from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Barrier

import pytest
from django.db import close_old_connections, connection
from django.urls import resolve
from django.utils import timezone
from rest_framework.test import APIClient

from apps.contests.models import Contest, ContestParticipant, ExamAnswer, ExamQuestion
from apps.users.models import User


def test_appeal_route_exists():
    match = resolve('/api/v1/contests/00000000-0000-0000-0000-000000000001/grade-appeals/')
    assert match.url_name == 'contest-grade-appeals-list'


@pytest.fixture
def case(db):
    teacher = User.objects.create_user(username='appeal_teacher', email='appeal_teacher@example.com', role='teacher')
    student = User.objects.create_user(username='appeal_student', email='appeal_student@example.com')
    other = User.objects.create_user(username='appeal_other', email='appeal_other@example.com')
    outsider = User.objects.create_user(username='appeal_outsider', email='appeal_outsider@example.com', role='teacher')
    contest = Contest.objects.create(
        name='Appeal exam', owner=teacher, contest_type='paper_exam', status='published',
        results_published=True, start_time=timezone.now()-timedelta(hours=2),
        end_time=timezone.now()-timedelta(hours=1),
    )
    participant = ContestParticipant.objects.create(contest=contest, user=student, exam_status='submitted')
    ContestParticipant.objects.create(contest=contest, user=other, exam_status='submitted')
    question = ExamQuestion.objects.create(contest=contest, question_type='essay', prompt='Explain', score=10, order=0)
    answer = ExamAnswer.objects.create(participant=participant, question=question, answer={'text':'My answer'}, score=6, feedback='Original feedback')
    return {'teacher': teacher, 'student': student, 'other': other, 'outsider': outsider,
            'contest': contest, 'answer': answer, 'question': question}


def client(user):
    api = APIClient()
    api.force_authenticate(user=user)
    return api


def url(case, suffix=''):
    return f"/api/v1/contests/{case['contest'].id}/grade-appeals/{suffix}"


def opened(case):
    response = client(case['student']).post(url(case), {'exam_answer':case['answer'].id, 'content':'Please review'}, format='json')
    assert response.status_code == 201, response.data
    return response.data["data"]


def test_conversation_and_idempotent_closure(case):
    ticket = opened(case)
    detail = url(case, f"{ticket['id']}/")
    for user, content in [(case['teacher'],'Which part?'), (case['student'],'The second paragraph'), (case['teacher'],'Reviewed')]:
        result = client(user).post(detail+'messages/', {'content':content, 'author':case['other'].id}, format='json')
        assert result.status_code == 201, result.data
    response = client(case['student']).get(detail)
    assert response.data['data']['status'] == 'open'
    assert [m['content'] for m in response.data['data']['messages']] == ['Please review','Which part?','The second paragraph','Reviewed']
    assert [m['author_id'] for m in response.data['data']['messages']] == [case['student'].id,case['teacher'].id,case['student'].id,case['teacher'].id]
    assert client(case['student']).post(detail+'close/').status_code == 403
    closed = client(case['teacher']).post(detail+'close/')
    assert closed.status_code == 200
    again = client(case['teacher']).post(detail+'close/')
    assert again.data['data']['closed_at'] == closed.data['data']['closed_at']
    assert again.data['data']['closed_by'] == closed.data['data']['closed_by'] == case['teacher'].id
    for user in [case['teacher'], case['student']]:
        assert client(user).post(detail+'messages/', {'content':'Late'}, format='json').status_code == 409
        assert len(client(user).get(detail).data['data']['messages']) == 4
    case['answer'].refresh_from_db()
    assert case['answer'].score == 6
    assert case['answer'].feedback == 'Original feedback'


def test_duplicate_create_returns_existing_without_extra_message(case):
    ticket = opened(case)
    again = client(case['student']).post(url(case), {'exam_answer':case['answer'].id, 'content':'Duplicate'}, format='json')
    assert again.status_code == 200
    assert again.data['data']['id'] == ticket['id']
    assert len(again.data['data']['messages']) == 1


@pytest.mark.parametrize('who', ['other','outsider'])
def test_private_scope_and_no_other_student_creation(case, who):
    ticket = opened(case)
    api = client(case[who])
    listing = api.get(url(case))
    assert listing.status_code in [200,403]
    if listing.status_code == 200:
        assert listing.data['data'] == []
    detail = url(case, f"{ticket['id']}/")
    for method, target, body in [('get',detail,{}),('post',detail+'messages/',{'content':'intrusion'}),('post',detail+'close/',{})]:
        assert getattr(api, method)(target, body, format='json').status_code in [403,404]
    assert api.post(url(case), {'exam_answer':case['answer'].id,'content':'intrusion'}, format='json').status_code in [403,404]


@pytest.mark.parametrize('content', ['', '   ', 'x'*5001], ids=['empty', 'whitespace', 'too-long'])
def test_invalid_message_rejected_atomically(case, content):
    from apps.contests.models import GradeAppeal
    api = client(case['student'])
    response = api.post(url(case), {'exam_answer':case['answer'].id, 'content':content}, format='json')
    assert response.status_code == 400
    assert GradeAppeal.objects.count() == 0
    ticket = opened(case)
    response = api.post(url(case,f"{ticket['id']}/messages/"), {'content':content}, format='json')
    assert response.status_code == 400
    assert len(api.get(url(case,f"{ticket['id']}/")).data['data']['messages']) == 1


def test_unpublished_blocks_students_but_preserves_staff_access(case):
    ticket = opened(case)
    case['contest'].results_published = False
    case['contest'].save()
    detail = url(case,f"{ticket['id']}/")
    api = client(case['student'])
    assert api.get(url(case)).status_code == 403
    assert api.get(detail).status_code == 403
    assert api.post(detail+'messages/',{'content':'hidden'},format='json').status_code == 403
    assert api.post(url(case),{'exam_answer':case['answer'].id,'content':'hidden'},format='json').status_code == 403
    assert client(case['teacher']).get(detail).status_code == 200
    case['contest'].results_published = True
    case['contest'].save()
    assert api.get(detail).status_code == 200


def test_wrong_contest_ungraded_and_coding_exam_rejected(case):
    api = client(case['student'])
    case['answer'].score = None
    case['answer'].save()
    assert api.post(url(case),{'exam_answer':case['answer'].id,'content':'review'},format='json').status_code == 400
    case['answer'].score = 6
    case['answer'].save()
    original = case['answer'].participant
    another = Contest.objects.create(name='Other',owner=case['teacher'],contest_type='paper_exam',status='published',results_published=True,start_time=timezone.now(),end_time=timezone.now()+timedelta(hours=1))
    original.contest = another
    original.save()
    assert api.post(url(case),{'exam_answer':case['answer'].id,'content':'review'},format='json').status_code in [403,404]
    original.contest = case['contest']
    original.save()
    case['contest'].contest_type = 'coding'
    case['contest'].save()
    assert api.post(url(case),{'exam_answer':case['answer'].id,'content':'review'},format='json').status_code == 404


def test_no_edit_delete_or_anonymous_access(case):
    ticket = opened(case)
    target = url(case,f"{ticket['id']}/")
    assert APIClient().get(target).status_code in [401,403]
    for user in [case['student'],case['teacher']]:
        assert client(user).patch(target,{'status':'closed'},format='json').status_code == 405
        assert client(user).delete(target).status_code == 405


def test_current_score_uses_existing_policy_and_grade_flow(case):
    ticket = opened(case)
    case['question'].score_policy = 'full_marks'
    case['question'].save()
    detail = url(case,f"{ticket['id']}/")
    assert client(case['student']).get(detail).data['data']['current_score'] == 10
    result = client(case['teacher']).post(f"/api/v1/contests/{case['contest'].id}/exam-answers/{case['answer'].id}/grade/", {'score':8,'feedback':'Updated'},format='json')
    assert result.status_code == 200
    case['question'].score_policy = 'normal'
    case['question'].save()
    data = client(case['student']).get(detail).data["data"]
    assert data['current_score'] == 8
    assert data['answer']['feedback'] == 'Updated'
    assert data['status'] == 'open'


@pytest.mark.django_db(transaction=True)
def test_concurrent_open_and_send_close(case):
    if connection.vendor != 'postgresql':
        pytest.skip('Row lock verification requires PostgreSQL')
    barrier = Barrier(2)
    def run(user, target, body):
        close_old_connections()
        try:
            barrier.wait(timeout=10)
            return client(user).post(target,body,format='json')
        finally:
            close_old_connections()
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(run,case['student'],url(case),{'exam_answer':case['answer'].id,'content':'Open'}) for _ in range(2)]
        responses = [f.result(timeout=20) for f in futures]
    assert sorted(r.status_code for r in responses) == [200,201]
    assert responses[0].data['data']['id'] == responses[1].data['data']['id']
    detail = url(case,f"{responses[0].data['data']['id']}/")
    with ThreadPoolExecutor(max_workers=2) as pool:
        send = pool.submit(run,case['student'],detail+'messages/',{'content':'Racing'})
        close = pool.submit(run,case['teacher'],detail+'close/',{})
        sent, closed = send.result(timeout=20), close.result(timeout=20)
    assert sent.status_code in [201,409]
    assert closed.status_code == 200
    data = client(case['student']).get(detail).data["data"]
    assert data['status'] == 'closed'
    assert len(data['messages']) == (2 if sent.status_code == 201 else 1)
