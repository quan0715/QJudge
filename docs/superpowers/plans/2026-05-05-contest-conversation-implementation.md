# 競賽公告與對話功能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 取代既有 Clarification 模型為雙向 Conversation thread，新增 navbar 通知鈴鐺，並讓教師於 proctoring panel 對特定學生發訊息。

**Architecture:**
- Backend：新增 `ContestConversation` + `ContestMessage`，`(contest, student)` unique；同 migration 刪除舊 `Clarification` 表
- Frontend：拆掉 `ContestClarifications.tsx` 巨檔，新增 `discussion/` 與 `notification/` 兩個元件夾、兩個 hook（`useContestConversations`、`useContestUnread`），鈴鐺掛在 `ContestLayout` 的 `HeaderGlobalBar`
- 已讀狀態用 localStorage（無後端 read receipt）

**Tech Stack:** Django 5 + DRF（後端）、React 18 + Carbon Design System + react-router-dom + react-i18next（前端）、pytest + RTL/Vitest（測試）

**參考文件：** `docs/superpowers/specs/2026-05-05-contest-announcement-qna-design.md`

---

## Phase 1：Backend 模型 + Migration

### Task 1: 新增 Conversation/Message model 並移除 Clarification

**Files:**
- Modify: `backend/apps/contests/models.py`
- Modify: `backend/apps/contests/admin.py`
- Create: `backend/apps/contests/migrations/0078_drop_clarification_add_conversation.py`

- [ ] **Step 1：在 `models.py` 中刪除 `Clarification` class**

定位 `backend/apps/contests/models.py:553-610`，整段 `class Clarification(models.Model)` 連同其 Meta 與 `__str__` 全部刪除。

- [ ] **Step 2：在 `models.py` 末尾、`ContestActivity` class 之前新增兩個新 model**

```python
class ContestConversation(models.Model):
    """
    Single conversation thread between a student and the teaching team.
    Unique per (contest, student) - one ongoing conversation per pair.
    """
    contest = models.ForeignKey(
        Contest,
        on_delete=models.CASCADE,
        related_name='conversations',
        verbose_name='競賽',
    )
    student = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='contest_conversations',
        verbose_name='學生',
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='建立時間')
    last_message_at = models.DateTimeField(verbose_name='最後一則訊息時間')

    class Meta:
        db_table = 'contest_conversations'
        verbose_name = '競賽對話'
        verbose_name_plural = '競賽對話'
        unique_together = [('contest', 'student')]
        ordering = ['-last_message_at']

    def __str__(self):
        return f"Conversation #{self.id} ({self.student.username} in contest {self.contest_id})"


class ContestMessage(models.Model):
    """
    A single message inside a ContestConversation thread.
    """
    SENDER_ROLE_CHOICES = [
        ('student', 'Student'),
        ('teacher', 'Teacher'),
    ]
    conversation = models.ForeignKey(
        ContestConversation,
        on_delete=models.CASCADE,
        related_name='messages',
        verbose_name='對話',
    )
    sender = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        related_name='sent_contest_messages',
        verbose_name='發送者',
    )
    sender_role = models.CharField(
        max_length=10,
        choices=SENDER_ROLE_CHOICES,
        verbose_name='發送者角色',
    )
    content = models.TextField(verbose_name='內容')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='建立時間')

    class Meta:
        db_table = 'contest_messages'
        verbose_name = '競賽訊息'
        verbose_name_plural = '競賽訊息'
        ordering = ['created_at']

    def __str__(self):
        return f"Message #{self.id} from {self.sender_role} in conv {self.conversation_id}"
```

- [ ] **Step 3：在 `admin.py` 中刪除 Clarification 註冊、新增兩個 model**

開啟 `backend/apps/contests/admin.py`，搜尋 `Clarification` 並把所有相關 import / `@admin.register(Clarification)` / class 整段刪除，於檔案結尾追加：

```python
from .models import ContestConversation, ContestMessage


@admin.register(ContestConversation)
class ContestConversationAdmin(admin.ModelAdmin):
    list_display = ('id', 'contest', 'student', 'last_message_at', 'created_at')
    list_filter = ('contest',)
    search_fields = ('student__username',)
    readonly_fields = ('created_at', 'last_message_at')


@admin.register(ContestMessage)
class ContestMessageAdmin(admin.ModelAdmin):
    list_display = ('id', 'conversation', 'sender_role', 'sender', 'created_at')
    list_filter = ('sender_role',)
    readonly_fields = ('created_at',)
```

- [ ] **Step 4：產生 migration**

Run：
```bash
bash .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend python manage.py makemigrations contests --name drop_clarification_add_conversation
```

Expected：產生 `backend/apps/contests/migrations/0078_drop_clarification_add_conversation.py`，內含 `DeleteModel(Clarification)` + `CreateModel(ContestConversation)` + `CreateModel(ContestMessage)`。

- [ ] **Step 5：套用 migration（dev DB 不保留 Clarification 資料）**

```bash
bash .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend python manage.py migrate contests
```

Expected：output 含 `0078_drop_clarification_add_conversation... OK`。

- [ ] **Step 6：Commit**

```bash
git add backend/apps/contests/models.py backend/apps/contests/admin.py backend/apps/contests/migrations/0078_drop_clarification_add_conversation.py
git commit -m "feat(contests): replace Clarification with Conversation+Message models"
```

---

### Task 2: 移除舊 Clarification 引用（serializers / urls / views）

**Files:**
- Modify: `backend/apps/contests/serializers.py`
- Modify: `backend/apps/contests/urls.py`
- Modify: `backend/apps/contests/views/__init__.py`
- Delete: `backend/apps/contests/views/clarification.py`

- [ ] **Step 1：刪除 `views/clarification.py`**

```bash
rm backend/apps/contests/views/clarification.py
```

- [ ] **Step 2：在 `views/__init__.py` 中移除 `ClarificationViewSet` 的 export**

開啟 `backend/apps/contests/views/__init__.py`，刪除 `from .clarification import ClarificationViewSet` 與相應的 `__all__` 條目。

- [ ] **Step 3：在 `urls.py` 中移除 clarification import + register**

定位 `backend/apps/contests/urls.py:7` 的 `ClarificationViewSet` import 整行刪除；同時刪除 `backend/apps/contests/urls.py:24` 的：
```python
contest_router.register(r'clarifications', ClarificationViewSet, basename='contest-clarifications')
```

- [ ] **Step 4：在 `serializers.py` 中刪除三個 Clarification serializer**

`grep -n "Clarification" backend/apps/contests/serializers.py` 找出 `ClarificationSerializer`、`ClarificationCreateSerializer`、`ClarificationReplySerializer` 三個 class，整段刪除（含相關 imports 中的 `Clarification` 引用）。

- [ ] **Step 5：驗證沒有殘餘引用**

```bash
grep -rn "Clarification" backend/apps/contests/ --include="*.py"
```
Expected：只剩下 migrations 歷史檔（不可動）內提及 Clarification 的舊紀錄；views/serializers/admin/urls 都不再 import 或使用該名稱。

- [ ] **Step 6：Commit**

```bash
git add backend/apps/contests/serializers.py backend/apps/contests/urls.py backend/apps/contests/views/__init__.py backend/apps/contests/views/clarification.py
git commit -m "refactor(contests): drop ClarificationViewSet and serializers"
```

---

### Task 3: 新增 Conversation/Message serializer

**Files:**
- Modify: `backend/apps/contests/serializers.py`

- [ ] **Step 1：在 `serializers.py` 末尾追加三個 serializer**

```python
class ContestMessageSerializer(serializers.ModelSerializer):
    sender_username = serializers.CharField(source='sender.username', read_only=True, default=None)

    class Meta:
        model = ContestMessage
        fields = ['id', 'sender', 'sender_username', 'sender_role', 'content', 'created_at']
        read_only_fields = ['id', 'sender', 'sender_username', 'sender_role', 'created_at']


class ContestConversationListSerializer(serializers.ModelSerializer):
    student_username = serializers.CharField(source='student.username', read_only=True)
    last_message = serializers.SerializerMethodField()
    first_sender_role = serializers.SerializerMethodField()

    class Meta:
        model = ContestConversation
        fields = [
            'id', 'student', 'student_username',
            'created_at', 'last_message_at',
            'last_message', 'first_sender_role',
        ]

    def get_last_message(self, obj):
        msg = obj.messages.order_by('-created_at').first()
        if not msg:
            return None
        return ContestMessageSerializer(msg).data

    def get_first_sender_role(self, obj):
        msg = obj.messages.order_by('created_at').first()
        return msg.sender_role if msg else None


class ContestConversationDetailSerializer(ContestConversationListSerializer):
    messages = ContestMessageSerializer(many=True, read_only=True)

    class Meta(ContestConversationListSerializer.Meta):
        fields = ContestConversationListSerializer.Meta.fields + ['messages']


class ContestConversationCreateSerializer(serializers.Serializer):
    initial_content = serializers.CharField()
    student_id = serializers.UUIDField(required=False, allow_null=True)


class SendMessageToStudentSerializer(serializers.Serializer):
    student_id = serializers.UUIDField()
    content = serializers.CharField()


class AppendMessageSerializer(serializers.Serializer):
    content = serializers.CharField()
```

確保上方 `from .models import` 區塊新增 `ContestConversation, ContestMessage`。

- [ ] **Step 2：Commit**

```bash
git add backend/apps/contests/serializers.py
git commit -m "feat(contests): add Conversation/Message serializers"
```

---

### Task 4: 新增 ContestConversationViewSet

**Files:**
- Create: `backend/apps/contests/views/conversation.py`
- Modify: `backend/apps/contests/views/__init__.py`
- Modify: `backend/apps/contests/urls.py`

- [ ] **Step 1：建立 `views/conversation.py`**

```python
"""ContestConversationViewSet."""
from django.db import IntegrityError, transaction
from django.db.models import OuterRef, Subquery
from django.utils import timezone
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, NotFound, ValidationError
from rest_framework.response import Response
from django.shortcuts import get_object_or_404

from ..models import Contest, ContestConversation, ContestMessage, User
from ..serializers import (
    ContestConversationListSerializer,
    ContestConversationDetailSerializer,
    ContestConversationCreateSerializer,
    SendMessageToStudentSerializer,
    AppendMessageSerializer,
    ContestMessageSerializer,
)
from ..permissions import can_manage_contest


def _is_contest_active_for_student(contest):
    now = timezone.now()
    if contest.end_time and now > contest.end_time:
        return False
    return True


def _annotate_last_message_role(qs):
    last_msg_role = ContestMessage.objects.filter(
        conversation=OuterRef('pk')
    ).order_by('-created_at').values('sender_role')[:1]
    return qs.annotate(_last_role=Subquery(last_msg_role))


class ContestConversationViewSet(viewsets.GenericViewSet):
    """
    GET    /contests/{contest_pk}/conversations/                  教師 list
    GET    /contests/{contest_pk}/conversations/me/               學生取自己的（404 if none）
    GET    /contests/{contest_pk}/conversations/{pk}/             retrieve（含 messages）
    POST   /contests/{contest_pk}/conversations/                  學生 create（idempotent）
    POST   /contests/{contest_pk}/conversations/{pk}/messages/    append message
    POST   /contests/{contest_pk}/conversations/messages-to-student/  教師 ensure-and-append
    """
    permission_classes = [permissions.IsAuthenticated]

    def _get_contest(self):
        contest_id = self.kwargs.get('contest_pk')
        return get_object_or_404(Contest, id=contest_id)

    def _is_manager(self, contest):
        return can_manage_contest(self.request.user, contest)

    def _serialize_detail(self, conversation):
        return ContestConversationDetailSerializer(conversation).data

    # ── list (teacher only) ────────────────────────────────────────────
    def list(self, request, contest_pk=None):
        contest = self._get_contest()
        if not self._is_manager(request.user):
            raise PermissionDenied("Only teaching staff can list conversations.")

        qs = ContestConversation.objects.filter(contest=contest).select_related('student')
        qs = _annotate_last_message_role(qs)

        awaiting = request.query_params.get('awaiting')
        if awaiting == 'teacher':
            qs = qs.filter(_last_role='student')
        elif awaiting == 'student':
            qs = qs.filter(_last_role='teacher')

        data = ContestConversationListSerializer(qs, many=True).data
        return Response(data)

    # ── retrieve ───────────────────────────────────────────────────────
    def retrieve(self, request, pk=None, contest_pk=None):
        contest = self._get_contest()
        conv = get_object_or_404(ContestConversation, pk=pk, contest=contest)
        if not self._is_manager(request.user) and conv.student_id != request.user.id:
            raise PermissionDenied("You can only view your own conversation.")
        return Response(self._serialize_detail(conv))

    # ── student: my conversation ──────────────────────────────────────
    @action(detail=False, methods=['get'], url_path='me')
    def me(self, request, contest_pk=None):
        contest = self._get_contest()
        try:
            conv = ContestConversation.objects.get(contest=contest, student=request.user)
        except ContestConversation.DoesNotExist:
            raise NotFound("No conversation yet.")
        return Response(self._serialize_detail(conv))

    # ── create (student-initiated) ────────────────────────────────────
    def create(self, request, contest_pk=None):
        contest = self._get_contest()
        serializer = ContestConversationCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        if self._is_manager(request.user):
            raise PermissionDenied(
                "Teachers should use POST /messages-to-student/ to send messages."
            )

        if not _is_contest_active_for_student(contest):
            raise PermissionDenied("Contest has ended; cannot start a new message.")

        with transaction.atomic():
            conv, created = ContestConversation.objects.get_or_create(
                contest=contest,
                student=request.user,
                defaults={'last_message_at': timezone.now()},
            )
            self._append_message(
                conv, sender=request.user, sender_role='student',
                content=serializer.validated_data['initial_content'],
            )
        return Response(
            self._serialize_detail(conv),
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    # ── append message ────────────────────────────────────────────────
    @action(detail=True, methods=['post'], url_path='messages')
    def append_message(self, request, pk=None, contest_pk=None):
        contest = self._get_contest()
        conv = get_object_or_404(ContestConversation, pk=pk, contest=contest)
        serializer = AppendMessageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        if self._is_manager(request.user):
            sender_role = 'teacher'
        else:
            if conv.student_id != request.user.id:
                raise PermissionDenied("You can only post in your own conversation.")
            if not _is_contest_active_for_student(contest):
                raise PermissionDenied("Contest has ended; cannot post message.")
            sender_role = 'student'

        msg = self._append_message(
            conv, sender=request.user, sender_role=sender_role,
            content=serializer.validated_data['content'],
        )
        return Response(ContestMessageSerializer(msg).data, status=status.HTTP_201_CREATED)

    # ── teacher: ensure-and-append to a specific student ──────────────
    @action(detail=False, methods=['post'], url_path='messages-to-student')
    def messages_to_student(self, request, contest_pk=None):
        contest = self._get_contest()
        if not self._is_manager(request.user):
            raise PermissionDenied("Only teaching staff can use this endpoint.")
        serializer = SendMessageToStudentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        student_id = serializer.validated_data['student_id']
        try:
            student = User.objects.get(id=student_id)
        except User.DoesNotExist:
            raise ValidationError({'student_id': 'Student not found.'})

        with transaction.atomic():
            conv, _created = ContestConversation.objects.get_or_create(
                contest=contest, student=student,
                defaults={'last_message_at': timezone.now()},
            )
            self._append_message(
                conv, sender=request.user, sender_role='teacher',
                content=serializer.validated_data['content'],
            )
        return Response(self._serialize_detail(conv), status=status.HTTP_201_CREATED)

    # ── helper ────────────────────────────────────────────────────────
    def _append_message(self, conversation, sender, sender_role, content):
        msg = ContestMessage.objects.create(
            conversation=conversation,
            sender=sender,
            sender_role=sender_role,
            content=content,
        )
        conversation.last_message_at = msg.created_at
        conversation.save(update_fields=['last_message_at'])
        return msg
```

- [ ] **Step 2：在 `views/__init__.py` 加上 export**

```python
from .conversation import ContestConversationViewSet
```

並加進 `__all__`（若有）。

- [ ] **Step 3：在 `urls.py` 註冊新 router**

`backend/apps/contests/urls.py` 內找 `contest_router.register(r'announcements', ...)` 區塊，下方追加：

```python
from .views import ContestConversationViewSet
contest_router.register(r'conversations', ContestConversationViewSet, basename='contest-conversations')
```

（若 `from .views import ...` 已存在則直接把 `ContestConversationViewSet` 加進去）

- [ ] **Step 4：用 Django shell 確認 URL 可解析**

```bash
bash .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T backend python manage.py show_urls | grep conversation
```

Expected：列出 `/api/contests/<contest_pk>/conversations/` 等 endpoints。

- [ ] **Step 5：Commit**

```bash
git add backend/apps/contests/views/conversation.py backend/apps/contests/views/__init__.py backend/apps/contests/urls.py
git commit -m "feat(contests): add ContestConversationViewSet"
```

---

### Task 5: 後端測試（list / create / append / messages-to-student / 權限）

**Files:**
- Create: `backend/apps/contests/tests/conversation/__init__.py`
- Create: `backend/apps/contests/tests/conversation/test_conversation_viewset.py`

- [ ] **Step 1：建立測試骨架**

```python
# backend/apps/contests/tests/conversation/__init__.py
```
（空檔案）

- [ ] **Step 2：撰寫測試**

```python
# backend/apps/contests/tests/conversation/test_conversation_viewset.py
import pytest
from django.urls import reverse
from rest_framework.test import APIClient
from django.contrib.auth import get_user_model

from apps.contests.models import (
    Contest, ContestParticipant, ContestConversation, ContestMessage
)

User = get_user_model()


@pytest.fixture
def teacher(db):
    return User.objects.create_user(username='teacher1', password='x', role='teacher')


@pytest.fixture
def student(db):
    return User.objects.create_user(username='student1', password='x', role='student')


@pytest.fixture
def other_student(db):
    return User.objects.create_user(username='student2', password='x', role='student')


@pytest.fixture
def contest(db, teacher, student, other_student):
    from django.utils import timezone
    from datetime import timedelta
    c = Contest.objects.create(
        name='Test',
        owner=teacher,
        start_time=timezone.now() - timedelta(hours=1),
        end_time=timezone.now() + timedelta(hours=1),
    )
    ContestParticipant.objects.create(contest=c, user=student)
    ContestParticipant.objects.create(contest=c, user=other_student)
    return c


def _client(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


def test_student_create_conversation_idempotent(contest, student):
    url = f'/api/contests/{contest.id}/conversations/'
    client = _client(student)
    r1 = client.post(url, {'initial_content': 'hello'}, format='json')
    assert r1.status_code == 201
    conv_id = r1.data['id']

    r2 = client.post(url, {'initial_content': 'hello again'}, format='json')
    assert r2.status_code == 200
    assert r2.data['id'] == conv_id
    assert ContestConversation.objects.filter(contest=contest, student=student).count() == 1
    assert ContestMessage.objects.filter(conversation_id=conv_id).count() == 2


def test_student_get_me_returns_404_when_no_conversation(contest, student):
    url = f'/api/contests/{contest.id}/conversations/me/'
    r = _client(student).get(url)
    assert r.status_code == 404


def test_student_cannot_view_other_students_conversation(contest, student, other_student):
    conv = ContestConversation.objects.create(
        contest=contest, student=other_student, last_message_at='2024-01-01T00:00:00Z'
    )
    url = f'/api/contests/{contest.id}/conversations/{conv.id}/'
    r = _client(student).get(url)
    assert r.status_code == 403


def test_teacher_list_filters_awaiting_teacher(contest, teacher, student, other_student):
    conv1 = ContestConversation.objects.create(
        contest=contest, student=student, last_message_at='2024-01-01T00:00:00Z'
    )
    ContestMessage.objects.create(conversation=conv1, sender=student, sender_role='student', content='ask')
    conv2 = ContestConversation.objects.create(
        contest=contest, student=other_student, last_message_at='2024-01-01T00:00:00Z'
    )
    ContestMessage.objects.create(conversation=conv2, sender=other_student, sender_role='student', content='q')
    ContestMessage.objects.create(conversation=conv2, sender=teacher, sender_role='teacher', content='a')

    url = f'/api/contests/{contest.id}/conversations/?awaiting=teacher'
    r = _client(teacher).get(url)
    assert r.status_code == 200
    assert {c['id'] for c in r.data} == {conv1.id}


def test_student_create_blocked_after_contest_ended(contest, student):
    from django.utils import timezone
    from datetime import timedelta
    contest.end_time = timezone.now() - timedelta(minutes=1)
    contest.save()

    url = f'/api/contests/{contest.id}/conversations/'
    r = _client(student).post(url, {'initial_content': 'late'}, format='json')
    assert r.status_code == 403


def test_teacher_messages_to_student_creates_conversation(contest, teacher, student):
    url = f'/api/contests/{contest.id}/conversations/messages-to-student/'
    r = _client(teacher).post(url, {'student_id': str(student.id), 'content': 'pay attention'}, format='json')
    assert r.status_code == 201
    conv = ContestConversation.objects.get(contest=contest, student=student)
    msgs = list(conv.messages.all())
    assert len(msgs) == 1
    assert msgs[0].sender_role == 'teacher'


def test_teacher_messages_to_student_appends_to_existing(contest, teacher, student):
    conv = ContestConversation.objects.create(
        contest=contest, student=student, last_message_at='2024-01-01T00:00:00Z'
    )
    ContestMessage.objects.create(conversation=conv, sender=student, sender_role='student', content='q')

    url = f'/api/contests/{contest.id}/conversations/messages-to-student/'
    r = _client(teacher).post(url, {'student_id': str(student.id), 'content': 'a'}, format='json')
    assert r.status_code == 201
    assert conv.messages.count() == 2


def test_student_append_message_blocked_after_contest_ended(contest, student):
    conv = ContestConversation.objects.create(
        contest=contest, student=student, last_message_at='2024-01-01T00:00:00Z'
    )
    from django.utils import timezone
    from datetime import timedelta
    contest.end_time = timezone.now() - timedelta(minutes=1)
    contest.save()

    url = f'/api/contests/{contest.id}/conversations/{conv.id}/messages/'
    r = _client(student).post(url, {'content': 'late'}, format='json')
    assert r.status_code == 403


def test_student_cannot_use_messages_to_student_endpoint(contest, student, other_student):
    url = f'/api/contests/{contest.id}/conversations/messages-to-student/'
    r = _client(student).post(url, {'student_id': str(other_student.id), 'content': 'x'}, format='json')
    assert r.status_code == 403
```

- [ ] **Step 3：執行測試**

```bash
bash .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T -e PYTEST_ADDOPTS='--no-cov' backend pytest apps/contests/tests/conversation/ -v
```

Expected：所有測試 pass。如有 fail，回頭 debug View / Serializer。

- [ ] **Step 4：Commit**

```bash
git add backend/apps/contests/tests/conversation/
git commit -m "test(contests): add Conversation viewset coverage"
```

---

## Phase 2：Frontend Infrastructure

### Task 6: Entity types + API repository

**Files:**
- Modify: `frontend/src/core/entities/contest.entity.ts`
- Create: `frontend/src/infrastructure/api/repositories/contestConversation.ts`
- Modify: `frontend/src/infrastructure/api/repositories/index.ts`
- Modify: `frontend/src/infrastructure/mappers/contest.mapper.ts`

- [ ] **Step 1：在 `contest.entity.ts` 中新增三個 type，移除 Clarification**

開啟 `frontend/src/core/entities/contest.entity.ts`，刪除 `Clarification` 相關 type（搜尋 `Clarification` 的所有 export type / interface），於檔案末尾新增：

```typescript
export type ContestMessageSenderRole = 'student' | 'teacher';

export interface ContestMessage {
  id: string;
  sender: string | null;
  senderUsername: string | null;
  senderRole: ContestMessageSenderRole;
  content: string;
  createdAt: string;
}

export interface ContestConversation {
  id: string;
  student: string;
  studentUsername: string;
  createdAt: string;
  lastMessageAt: string;
  lastMessage: ContestMessage | null;
  firstSenderRole: ContestMessageSenderRole | null;
  messages?: ContestMessage[];
}
```

- [ ] **Step 2：在 `contest.mapper.ts` 中新增兩個 mapper，移除 Clarification mapper**

刪除既有 `mapClarificationDto`（搜尋並整段刪除），新增：

```typescript
import type { ContestConversation, ContestMessage } from '@/core/entities/contest.entity';

export const mapContestMessageDto = (raw: any): ContestMessage => ({
  id: String(raw.id),
  sender: raw.sender ? String(raw.sender) : null,
  senderUsername: raw.sender_username ?? null,
  senderRole: raw.sender_role,
  content: raw.content,
  createdAt: raw.created_at,
});

export const mapContestConversationDto = (raw: any): ContestConversation => ({
  id: String(raw.id),
  student: String(raw.student),
  studentUsername: raw.student_username ?? '',
  createdAt: raw.created_at,
  lastMessageAt: raw.last_message_at,
  lastMessage: raw.last_message ? mapContestMessageDto(raw.last_message) : null,
  firstSenderRole: raw.first_sender_role ?? null,
  messages: Array.isArray(raw.messages) ? raw.messages.map(mapContestMessageDto) : undefined,
});
```

- [ ] **Step 3：建立 repository 檔**

```typescript
// frontend/src/infrastructure/api/repositories/contestConversation.ts
import apiClient from '@/infrastructure/api/client';
import {
  mapContestConversationDto,
  mapContestMessageDto,
} from '@/infrastructure/mappers/contest.mapper';
import type {
  ContestConversation,
  ContestMessage,
} from '@/core/entities/contest.entity';

const base = (contestId: string) => `/api/contests/${contestId}/conversations`;

export const listConversations = async (
  contestId: string,
  awaiting?: 'teacher' | 'student',
): Promise<ContestConversation[]> => {
  const params = awaiting ? { awaiting } : {};
  const { data } = await apiClient.get(`${base(contestId)}/`, { params });
  return (data as unknown[]).map(mapContestConversationDto);
};

export const getMyConversation = async (
  contestId: string,
): Promise<ContestConversation | null> => {
  try {
    const { data } = await apiClient.get(`${base(contestId)}/me/`);
    return mapContestConversationDto(data);
  } catch (err: any) {
    if (err?.response?.status === 404) return null;
    throw err;
  }
};

export const getConversation = async (
  contestId: string,
  conversationId: string,
): Promise<ContestConversation> => {
  const { data } = await apiClient.get(`${base(contestId)}/${conversationId}/`);
  return mapContestConversationDto(data);
};

export const createStudentConversation = async (
  contestId: string,
  initialContent: string,
): Promise<ContestConversation> => {
  const { data } = await apiClient.post(`${base(contestId)}/`, {
    initial_content: initialContent,
  });
  return mapContestConversationDto(data);
};

export const appendMessage = async (
  contestId: string,
  conversationId: string,
  content: string,
): Promise<ContestMessage> => {
  const { data } = await apiClient.post(
    `${base(contestId)}/${conversationId}/messages/`,
    { content },
  );
  return mapContestMessageDto(data);
};

export const sendMessageToStudent = async (
  contestId: string,
  studentId: string,
  content: string,
): Promise<ContestConversation> => {
  const { data } = await apiClient.post(
    `${base(contestId)}/messages-to-student/`,
    { student_id: studentId, content },
  );
  return mapContestConversationDto(data);
};
```

- [ ] **Step 4：在 `repositories/index.ts` 補 export，並把所有 `createClarification / replyClarification / deleteClarification / getClarifications` 整段刪除**

`grep -n "Clarification" frontend/src/infrastructure/api/repositories/index.ts` 找出後刪除，於底部新增：

```typescript
export {
  listConversations,
  getMyConversation,
  getConversation,
  createStudentConversation,
  appendMessage,
  sendMessageToStudent,
} from './contestConversation';
```

- [ ] **Step 5：型別檢查**

```bash
cd frontend && npm run -s typecheck
```

Expected：通過。預期會有「`useClarifications` 等檔尚未刪除而引用刪除的 type」錯誤 —— 這些檔案會在後續任務中刪除，先把錯誤檔列入下一階段（Phase 6）的清單，**此階段允許這幾個錯誤暫時存在**。

> 若 typecheck 是 CI gate 又無法 pass，可在此 task 提前刪除 `useClarifications.ts`（檔案內容暫時換成 `export {}`），等 Phase 6 真正清理。實作上以「先讓 type 通過為止」為原則。

- [ ] **Step 6：Commit**

```bash
git add frontend/src/core/entities/contest.entity.ts frontend/src/infrastructure/api/repositories/contestConversation.ts frontend/src/infrastructure/api/repositories/index.ts frontend/src/infrastructure/mappers/contest.mapper.ts
git commit -m "feat(api): conversation entity + repository"
```

---

### Task 7: localStorage 已讀工具

**Files:**
- Create: `frontend/src/features/contest/hooks/contestReadStorage.ts`
- Create: `frontend/src/features/contest/hooks/contestReadStorage.test.ts`

- [ ] **Step 1：寫失敗測試**

```typescript
// frontend/src/features/contest/hooks/contestReadStorage.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadReadIds,
  saveReadIds,
  markRead,
  isRead,
  STORAGE_KEY_PREFIX,
} from './contestReadStorage';

describe('contestReadStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns empty Set when no entry exists', () => {
    expect(loadReadIds('c1').size).toBe(0);
  });

  it('persists ids per contest', () => {
    saveReadIds('c1', new Set(['ann:1', 'msg:5']));
    expect(loadReadIds('c1')).toEqual(new Set(['ann:1', 'msg:5']));
    expect(loadReadIds('c2').size).toBe(0);
  });

  it('markRead adds ids without dropping existing ones', () => {
    saveReadIds('c1', new Set(['ann:1']));
    markRead('c1', ['ann:2', 'msg:9']);
    expect(loadReadIds('c1')).toEqual(new Set(['ann:1', 'ann:2', 'msg:9']));
  });

  it('isRead reflects storage', () => {
    saveReadIds('c1', new Set(['ann:1']));
    expect(isRead('c1', 'ann:1')).toBe(true);
    expect(isRead('c1', 'ann:2')).toBe(false);
  });

  it('uses the documented key prefix', () => {
    saveReadIds('c1', new Set(['ann:1']));
    expect(localStorage.getItem(`${STORAGE_KEY_PREFIX}c1.readIds`)).toBeTruthy();
  });
});
```

- [ ] **Step 2：執行確認 fail**

```bash
cd frontend && npm test -- contestReadStorage
```

Expected：fail（檔案尚不存在）。

- [ ] **Step 3：實作**

```typescript
// frontend/src/features/contest/hooks/contestReadStorage.ts
export const STORAGE_KEY_PREFIX = 'qjudge.contest.';

const keyFor = (contestId: string) => `${STORAGE_KEY_PREFIX}${contestId}.readIds`;

export const loadReadIds = (contestId: string): Set<string> => {
  try {
    const raw = localStorage.getItem(keyFor(contestId));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed) : new Set();
  } catch {
    return new Set();
  }
};

export const saveReadIds = (contestId: string, ids: Set<string>): void => {
  try {
    localStorage.setItem(keyFor(contestId), JSON.stringify([...ids]));
  } catch (err) {
    console.warn('[contestReadStorage] failed to save', err);
  }
};

export const markRead = (contestId: string, ids: string[]): void => {
  if (ids.length === 0) return;
  const current = loadReadIds(contestId);
  ids.forEach((id) => current.add(id));
  saveReadIds(contestId, current);
};

export const isRead = (contestId: string, id: string): boolean =>
  loadReadIds(contestId).has(id);
```

- [ ] **Step 4：執行測試 pass**

```bash
cd frontend && npm test -- contestReadStorage
```

Expected：5 tests pass。

- [ ] **Step 5：Commit**

```bash
git add frontend/src/features/contest/hooks/contestReadStorage.ts frontend/src/features/contest/hooks/contestReadStorage.test.ts
git commit -m "feat(contest): localStorage read-tracking utility"
```

---

### Task 8: useContestConversations hook（取代 useClarifications）

**Files:**
- Create: `frontend/src/features/contest/hooks/useContestConversations.ts`

- [ ] **Step 1：實作**

```typescript
// frontend/src/features/contest/hooks/useContestConversations.ts
import { useCallback, useEffect, useState } from 'react';
import {
  listConversations,
  getMyConversation,
  getContestAnnouncements,
} from '@/infrastructure/api/repositories';
import { mapContestAnnouncementDto } from '@/infrastructure/mappers/contest.mapper';
import { useInterval } from '@/shared/hooks/useInterval';
import type {
  ContestAnnouncement,
  ContestConversation,
} from '@/core/entities/contest.entity';

interface Options {
  pollIntervalMs?: number | null;
  role: 'student' | 'teacher';
  awaiting?: 'teacher' | 'student';
}

export const useContestConversations = (
  contestId: string,
  options: Options,
) => {
  const [announcements, setAnnouncements] = useState<ContestAnnouncement[]>([]);
  const [conversations, setConversations] = useState<ContestConversation[]>([]);
  const [myConversation, setMyConversation] = useState<ContestConversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const pollIntervalMs = options.pollIntervalMs ?? null;
  const role = options.role;
  const awaiting = options.awaiting;

  const fetchAll = useCallback(
    async (showLoading = false) => {
      if (!contestId) return;
      if (showLoading) setLoading(true);
      try {
        const [annData, convPart] = await Promise.all([
          getContestAnnouncements(contestId),
          role === 'teacher'
            ? listConversations(contestId, awaiting)
            : getMyConversation(contestId).then((c) => (c ? [c] : [])),
        ]);
        setAnnouncements(
          (Array.isArray(annData) ? annData : []).map((it: any) =>
            mapContestAnnouncementDto(it),
          ),
        );
        if (role === 'teacher') {
          setConversations(convPart);
          setMyConversation(null);
        } else {
          setConversations([]);
          setMyConversation(convPart[0] ?? null);
        }
        setError(null);
      } catch (err) {
        setError(err as Error);
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [contestId, role, awaiting],
  );

  useEffect(() => {
    fetchAll(true);
  }, [fetchAll]);

  useInterval(
    () => fetchAll(false),
    contestId && pollIntervalMs && pollIntervalMs > 0 ? pollIntervalMs : null,
  );

  return {
    announcements,
    conversations,
    myConversation,
    loading,
    error,
    refresh: () => fetchAll(false),
  };
};
```

- [ ] **Step 2：型別檢查**

```bash
cd frontend && npm run -s typecheck
```

Expected：通過（與既有 announcement repository / interval hook 已存在）。

- [ ] **Step 3：Commit**

```bash
git add frontend/src/features/contest/hooks/useContestConversations.ts
git commit -m "feat(contest): useContestConversations hook"
```

---

### Task 9: useContestUnread hook

**Files:**
- Create: `frontend/src/features/contest/hooks/useContestUnread.ts`
- Create: `frontend/src/features/contest/hooks/useContestUnread.test.ts`

- [ ] **Step 1：寫失敗測試**

```typescript
// frontend/src/features/contest/hooks/useContestUnread.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { computeUnread } from './useContestUnread';
import type {
  ContestAnnouncement,
  ContestConversation,
} from '@/core/entities/contest.entity';

const ann = (id: string): ContestAnnouncement =>
  ({ id, title: 't', content: 'c', createdAt: 'x' } as any);

const msg = (id: string, role: 'student' | 'teacher') =>
  ({ id, senderRole: role, content: 'm', createdAt: 'x', sender: null, senderUsername: null });

const conv = (
  id: string,
  messages: ReturnType<typeof msg>[],
): ContestConversation =>
  ({
    id, student: 's', studentUsername: 's',
    createdAt: 'x', lastMessageAt: 'x',
    lastMessage: messages[messages.length - 1] ?? null,
    firstSenderRole: messages[0]?.senderRole ?? null,
    messages,
  } as any);

describe('computeUnread', () => {
  beforeEach(() => localStorage.clear());

  it('student counts unread announcements + teacher messages', () => {
    const result = computeUnread({
      contestId: 'c1',
      role: 'student',
      announcements: [ann('1'), ann('2')],
      conversations: [],
      myConversation: conv('cv1', [
        msg('m1', 'student'),
        msg('m2', 'teacher'),
        msg('m3', 'teacher'),
      ]),
      readIds: new Set<string>(),
    });
    expect(result.unreadAnnouncementIds).toEqual(['1', '2']);
    expect(result.unreadMessageIds).toEqual(['m2', 'm3']);
    expect(result.unreadCount).toBe(4);
  });

  it('student excludes own messages from unread', () => {
    const result = computeUnread({
      contestId: 'c1',
      role: 'student',
      announcements: [],
      conversations: [],
      myConversation: conv('cv1', [msg('m1', 'student')]),
      readIds: new Set<string>(),
    });
    expect(result.unreadMessageIds).toEqual([]);
  });

  it('teacher unread = number of conversations awaiting teacher reply', () => {
    const result = computeUnread({
      contestId: 'c1',
      role: 'teacher',
      announcements: [ann('1')],
      conversations: [
        conv('cv1', [msg('m1', 'student')]),
        conv('cv2', [msg('m2', 'student'), msg('m3', 'teacher')]),
        conv('cv3', [msg('m4', 'student')]),
      ],
      myConversation: null,
      readIds: new Set<string>(),
    });
    expect(result.pendingConversationCount).toBe(2);
    expect(result.unreadCount).toBe(2);
    expect(result.unreadAnnouncementIds).toEqual([]);
  });

  it('respects already-read ids in localStorage', () => {
    const result = computeUnread({
      contestId: 'c1',
      role: 'student',
      announcements: [ann('1'), ann('2')],
      conversations: [],
      myConversation: conv('cv1', [msg('m1', 'teacher'), msg('m2', 'teacher')]),
      readIds: new Set<string>(['ann:1', 'msg:m1']),
    });
    expect(result.unreadAnnouncementIds).toEqual(['2']);
    expect(result.unreadMessageIds).toEqual(['m2']);
    expect(result.unreadCount).toBe(2);
  });
});
```

- [ ] **Step 2：執行測試確認 fail**

```bash
cd frontend && npm test -- useContestUnread
```

Expected：fail（檔案尚不存在）。

- [ ] **Step 3：實作**

```typescript
// frontend/src/features/contest/hooks/useContestUnread.ts
import { useCallback, useMemo, useState } from 'react';
import type {
  ContestAnnouncement,
  ContestConversation,
} from '@/core/entities/contest.entity';
import {
  loadReadIds,
  markRead as markReadStorage,
} from './contestReadStorage';

export interface ComputeUnreadInput {
  contestId: string;
  role: 'student' | 'teacher';
  announcements: ContestAnnouncement[];
  conversations: ContestConversation[];
  myConversation: ContestConversation | null;
  readIds: Set<string>;
}

export interface UnreadSummary {
  unreadAnnouncementIds: string[];
  unreadMessageIds: string[];
  pendingConversationCount: number;
  unreadCount: number;
}

export const computeUnread = (input: ComputeUnreadInput): UnreadSummary => {
  const { role, announcements, conversations, myConversation, readIds } = input;

  const unreadAnnouncementIds = announcements
    .map((a) => a.id)
    .filter((id) => !readIds.has(`ann:${id}`));

  if (role === 'teacher') {
    const pending = conversations.filter(
      (c) => c.lastMessage?.senderRole === 'student',
    ).length;
    return {
      unreadAnnouncementIds: [],
      unreadMessageIds: [],
      pendingConversationCount: pending,
      unreadCount: pending,
    };
  }

  const teacherMsgs = (myConversation?.messages ?? []).filter(
    (m) => m.senderRole === 'teacher',
  );
  const unreadMessageIds = teacherMsgs
    .map((m) => m.id)
    .filter((id) => !readIds.has(`msg:${id}`));

  return {
    unreadAnnouncementIds,
    unreadMessageIds,
    pendingConversationCount: 0,
    unreadCount: unreadAnnouncementIds.length + unreadMessageIds.length,
  };
};

export const useContestUnread = (input: Omit<ComputeUnreadInput, 'readIds'>) => {
  const [readVersion, setReadVersion] = useState(0);

  const readIds = useMemo(
    () => loadReadIds(input.contestId),
    [input.contestId, readVersion],
  );

  const summary = useMemo(
    () => computeUnread({ ...input, readIds }),
    [input, readIds],
  );

  const markRead = useCallback(
    (ids: string[]) => {
      if (!ids.length) return;
      markReadStorage(input.contestId, ids);
      setReadVersion((v) => v + 1);
    },
    [input.contestId],
  );

  const markAllRead = useCallback(() => {
    const annKeys = summary.unreadAnnouncementIds.map((id) => `ann:${id}`);
    const msgKeys = summary.unreadMessageIds.map((id) => `msg:${id}`);
    markRead([...annKeys, ...msgKeys]);
  }, [summary, markRead]);

  return { ...summary, markRead, markAllRead };
};
```

- [ ] **Step 4：執行測試 pass**

```bash
cd frontend && npm test -- useContestUnread
```

Expected：4 tests pass。

- [ ] **Step 5：Commit**

```bash
git add frontend/src/features/contest/hooks/useContestUnread.ts frontend/src/features/contest/hooks/useContestUnread.test.ts
git commit -m "feat(contest): useContestUnread hook with read tracking"
```

---

## Phase 3：Frontend Components — Discussion

### Task 10: ConversationThreadView

**Files:**
- Create: `frontend/src/features/contest/components/discussion/ConversationThreadView.tsx`
- Create: `frontend/src/features/contest/components/discussion/ConversationThreadView.module.scss`

- [ ] **Step 1：實作**

```tsx
// frontend/src/features/contest/components/discussion/ConversationThreadView.tsx
import { useEffect, useState } from 'react';
import { Button, TextArea, InlineNotification, Tag } from '@carbon/react';
import { Send } from '@carbon/icons-react';
import type { ContestConversation, ContestMessage } from '@/core/entities/contest.entity';
import styles from './ConversationThreadView.module.scss';

interface ConversationThreadViewProps {
  conversation: ContestConversation | null;
  /** 'student' or 'teacher' (current viewer role) */
  viewerRole: 'student' | 'teacher';
  /** if false, input is disabled (e.g., contest ended for student) */
  canPost: boolean;
  /** label for the disabled hint, shown above input when canPost=false */
  disabledHint?: string;
  /** called when sending message; promise resolves when done */
  onSend: (content: string) => Promise<void>;
  /** optional empty-state message when conversation is null */
  emptyHint?: string;
}

export const ConversationThreadView = ({
  conversation,
  viewerRole,
  canPost,
  disabledHint,
  onSend,
  emptyHint,
}: ConversationThreadViewProps) => {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setErrorMsg(null);
  }, [conversation?.id]);

  const handleSend = async () => {
    if (!draft.trim() || sending) return;
    setSending(true);
    setErrorMsg(null);
    try {
      await onSend(draft.trim());
      setDraft('');
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.detail ?? '訊息送出失敗，請稍後再試');
    } finally {
      setSending(false);
    }
  };

  const messages: ContestMessage[] = conversation?.messages ?? [];

  return (
    <div className={styles.thread}>
      <div className={styles.messages}>
        {messages.length === 0 && (
          <p className={styles.empty}>{emptyHint ?? '目前沒有訊息'}</p>
        )}
        {messages.map((m) => {
          const isMine =
            (m.senderRole === 'student' && viewerRole === 'student') ||
            (m.senderRole === 'teacher' && viewerRole === 'teacher');
          return (
            <div
              key={m.id}
              className={`${styles.bubble} ${isMine ? styles.mine : styles.theirs}`}
            >
              <div className={styles.meta}>
                <Tag size="sm" type={m.senderRole === 'teacher' ? 'cyan' : 'gray'}>
                  {m.senderRole === 'teacher' ? '老師' : '學生'}
                </Tag>
                <span className={styles.time}>{new Date(m.createdAt).toLocaleString()}</span>
              </div>
              <div className={styles.content}>{m.content}</div>
            </div>
          );
        })}
      </div>

      <div className={styles.composer}>
        {!canPost && disabledHint && (
          <InlineNotification
            kind="info"
            lowContrast
            hideCloseButton
            title={disabledHint}
            className={styles.hint}
          />
        )}
        {errorMsg && (
          <InlineNotification
            kind="error"
            lowContrast
            title={errorMsg}
            onCloseButtonClick={() => setErrorMsg(null)}
          />
        )}
        <TextArea
          id="conv-thread-input"
          labelText="輸入訊息"
          rows={3}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={!canPost || sending}
        />
        <div className={styles.composerActions}>
          <Button
            renderIcon={Send}
            disabled={!canPost || sending || !draft.trim()}
            onClick={handleSend}
          >
            {sending ? '傳送中…' : '送出'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ConversationThreadView;
```

- [ ] **Step 2：建立 SCSS**

```scss
// frontend/src/features/contest/components/discussion/ConversationThreadView.module.scss
.thread { display: flex; flex-direction: column; gap: 1rem; height: 100%; }
.messages { display: flex; flex-direction: column; gap: 0.75rem; min-height: 12rem; padding: 0.5rem; overflow-y: auto; }
.empty { color: var(--cds-text-secondary); text-align: center; padding: 2rem 0; }
.bubble { display: flex; flex-direction: column; gap: 0.25rem; padding: 0.75rem 1rem; border-radius: 0.25rem; max-width: 80%; }
.bubble.mine { align-self: flex-end; background: var(--cds-layer-accent); }
.bubble.theirs { align-self: flex-start; background: var(--cds-layer); }
.meta { display: flex; gap: 0.5rem; align-items: center; font-size: 0.75rem; color: var(--cds-text-secondary); }
.time {}
.content { white-space: pre-wrap; }
.composer { display: flex; flex-direction: column; gap: 0.5rem; }
.composerActions { display: flex; justify-content: flex-end; }
.hint {}
```

- [ ] **Step 3：型別檢查**

```bash
cd frontend && npm run -s typecheck
```

Expected：通過。

- [ ] **Step 4：Commit**

```bash
git add frontend/src/features/contest/components/discussion/ConversationThreadView.tsx frontend/src/features/contest/components/discussion/ConversationThreadView.module.scss
git commit -m "feat(contest): ConversationThreadView component"
```

---

### Task 11: ContestAnnouncementList

**Files:**
- Create: `frontend/src/features/contest/components/discussion/ContestAnnouncementList.tsx`

- [ ] **Step 1：實作**

```tsx
// frontend/src/features/contest/components/discussion/ContestAnnouncementList.tsx
import { useEffect, useRef } from 'react';
import { Tile, Tag, Button } from '@carbon/react';
import { TrashCan } from '@carbon/icons-react';
import type { ContestAnnouncement } from '@/core/entities/contest.entity';

interface Props {
  announcements: ContestAnnouncement[];
  unreadIds: Set<string>;
  canDelete?: boolean;
  onMarkRead: (ids: string[]) => void;
  onDelete?: (id: string) => void;
  onCreate?: () => void;
  showCreateButton?: boolean;
}

export const ContestAnnouncementList = ({
  announcements,
  unreadIds,
  canDelete,
  onMarkRead,
  onDelete,
  onCreate,
  showCreateButton,
}: Props) => {
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    observerRef.current = new IntersectionObserver(
      (entries) => {
        const ids = entries
          .filter((e) => e.isIntersecting)
          .map((e) => (e.target as HTMLElement).dataset.annId)
          .filter((id): id is string => !!id && unreadIds.has(id));
        if (ids.length) onMarkRead(ids.map((id) => `ann:${id}`));
      },
      { threshold: 0.5 },
    );
    return () => observerRef.current?.disconnect();
  }, [unreadIds, onMarkRead]);

  const refFn = (el: HTMLDivElement | null) => {
    if (el && observerRef.current) observerRef.current.observe(el);
  };

  return (
    <section>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <h4 style={{ margin: 0 }}>公告</h4>
        {showCreateButton && onCreate && (
          <Button kind="ghost" size="sm" onClick={onCreate}>
            發布公告
          </Button>
        )}
      </header>

      {announcements.length === 0 ? (
        <Tile><div style={{ padding: '1rem', textAlign: 'center', color: 'var(--cds-text-secondary)' }}>目前沒有任何公告</div></Tile>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {announcements.map((a) => {
            const unread = unreadIds.has(a.id);
            return (
              <Tile key={a.id}>
                <div ref={refFn} data-ann-id={a.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.25rem' }}>
                      <strong>{a.title}</strong>
                      {unread && <Tag size="sm" type="red">新</Tag>}
                    </div>
                    <p style={{ margin: '0.25rem 0', whiteSpace: 'pre-wrap' }}>{a.content}</p>
                    <small style={{ color: 'var(--cds-text-secondary)' }}>
                      {new Date(a.createdAt).toLocaleString()}
                    </small>
                  </div>
                  {canDelete && onDelete && (
                    <Button kind="ghost" size="sm" hasIconOnly renderIcon={TrashCan} iconDescription="刪除" onClick={() => onDelete(a.id)} />
                  )}
                </div>
              </Tile>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default ContestAnnouncementList;
```

- [ ] **Step 2：型別檢查**

```bash
cd frontend && npm run -s typecheck
```
Expected：通過。

- [ ] **Step 3：Commit**

```bash
git add frontend/src/features/contest/components/discussion/ContestAnnouncementList.tsx
git commit -m "feat(contest): ContestAnnouncementList with unread badge"
```

---

### Task 12: ContestConversationList（教師端列表）

**Files:**
- Create: `frontend/src/features/contest/components/discussion/ContestConversationList.tsx`

- [ ] **Step 1：實作**

```tsx
// frontend/src/features/contest/components/discussion/ContestConversationList.tsx
import { Tile, Tag } from '@carbon/react';
import type { ContestConversation } from '@/core/entities/contest.entity';

interface Props {
  conversations: ContestConversation[];
  selectedId: string | null;
  onSelect: (conversation: ContestConversation) => void;
}

export const ContestConversationList = ({ conversations, selectedId, onSelect }: Props) => {
  if (conversations.length === 0) {
    return <Tile><div style={{ padding: '1rem', color: 'var(--cds-text-secondary)' }}>目前沒有對話</div></Tile>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {conversations.map((c) => {
        const awaitingTeacher = c.lastMessage?.senderRole === 'student';
        const selected = c.id === selectedId;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelect(c)}
            style={{
              textAlign: 'left',
              border: selected ? '2px solid var(--cds-focus)' : '1px solid var(--cds-border-subtle)',
              borderRadius: '0.25rem',
              background: 'var(--cds-layer)',
              padding: '0.75rem',
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
              <strong>{c.studentUsername}</strong>
              {awaitingTeacher && <Tag size="sm" type="red">未回</Tag>}
            </div>
            <div style={{ color: 'var(--cds-text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
              {c.lastMessage?.content?.slice(0, 80) ?? '（尚無訊息）'}
            </div>
            <small style={{ color: 'var(--cds-text-helper)' }}>
              {new Date(c.lastMessageAt).toLocaleString()}
            </small>
          </button>
        );
      })}
    </div>
  );
};

export default ContestConversationList;
```

- [ ] **Step 2：型別檢查 + Commit**

```bash
cd frontend && npm run -s typecheck
git add frontend/src/features/contest/components/discussion/ContestConversationList.tsx
git commit -m "feat(contest): ContestConversationList for teacher panel"
```

---

### Task 13: PostAnnouncementModal + SendMessageModal

**Files:**
- Create: `frontend/src/features/contest/components/discussion/PostAnnouncementModal.tsx`
- Create: `frontend/src/features/contest/components/discussion/SendMessageModal.tsx`

- [ ] **Step 1：建 PostAnnouncementModal**

```tsx
// frontend/src/features/contest/components/discussion/PostAnnouncementModal.tsx
import { useState } from 'react';
import { Modal, TextArea, TextInput } from '@carbon/react';

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (title: string, content: string) => Promise<void>;
}

export const PostAnnouncementModal = ({ open, onClose, onSubmit }: Props) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim() || !content.trim() || sending) return;
    setSending(true);
    try {
      await onSubmit(title.trim(), content.trim());
      setTitle('');
      setContent('');
      onClose();
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      open={open}
      modalHeading="發布公告"
      primaryButtonText={sending ? '發布中…' : '發布'}
      secondaryButtonText="取消"
      primaryButtonDisabled={sending || !title.trim() || !content.trim()}
      onRequestClose={onClose}
      onRequestSubmit={handleSubmit}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <TextInput id="ann-title" labelText="標題" value={title} onChange={(e) => setTitle(e.target.value)} />
        <TextArea id="ann-content" labelText="內容" rows={5} value={content} onChange={(e) => setContent(e.target.value)} />
      </div>
    </Modal>
  );
};

export default PostAnnouncementModal;
```

- [ ] **Step 2：建 SendMessageModal**

```tsx
// frontend/src/features/contest/components/discussion/SendMessageModal.tsx
import { useState } from 'react';
import { Modal, TextArea } from '@carbon/react';

interface Props {
  open: boolean;
  recipientUsername: string;
  onClose: () => void;
  onSubmit: (content: string) => Promise<void>;
}

export const SendMessageModal = ({ open, recipientUsername, onClose, onSubmit }: Props) => {
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);

  const handleSubmit = async () => {
    if (!content.trim() || sending) return;
    setSending(true);
    try {
      await onSubmit(content.trim());
      setContent('');
      onClose();
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      open={open}
      modalHeading={`傳送訊息給：${recipientUsername}`}
      primaryButtonText={sending ? '傳送中…' : '送出'}
      secondaryButtonText="取消"
      primaryButtonDisabled={sending || !content.trim()}
      onRequestClose={onClose}
      onRequestSubmit={handleSubmit}
    >
      <TextArea id="send-msg-content" labelText="訊息內容" rows={5} value={content} onChange={(e) => setContent(e.target.value)} />
    </Modal>
  );
};

export default SendMessageModal;
```

- [ ] **Step 3：建 `discussion/index.ts`**

```typescript
// frontend/src/features/contest/components/discussion/index.ts
export { default as ConversationThreadView } from './ConversationThreadView';
export { default as ContestAnnouncementList } from './ContestAnnouncementList';
export { default as ContestConversationList } from './ContestConversationList';
export { default as PostAnnouncementModal } from './PostAnnouncementModal';
export { default as SendMessageModal } from './SendMessageModal';
```

- [ ] **Step 4：型別檢查 + Commit**

```bash
cd frontend && npm run -s typecheck
git add frontend/src/features/contest/components/discussion/
git commit -m "feat(contest): announcement and message modals + index"
```

---

### Task 14: StudentDiscussionView + AdminDiscussionView（組合元件）

**Files:**
- Create: `frontend/src/features/contest/components/discussion/StudentDiscussionView.tsx`
- Create: `frontend/src/features/contest/components/discussion/AdminDiscussionView.tsx`

- [ ] **Step 1：建 StudentDiscussionView**

```tsx
// frontend/src/features/contest/components/discussion/StudentDiscussionView.tsx
import { useEffect } from 'react';
import {
  ContestAnnouncementList,
  ConversationThreadView,
} from '@/features/contest/components/discussion';
import { useContestConversations } from '@/features/contest/hooks/useContestConversations';
import { useContestUnread } from '@/features/contest/hooks/useContestUnread';
import {
  appendMessage,
  createStudentConversation,
} from '@/infrastructure/api/repositories';

interface Props {
  contestId: string;
  contestEnded: boolean;
  contestNotStarted: boolean;
}

export const StudentDiscussionView = ({ contestId, contestEnded, contestNotStarted }: Props) => {
  const { announcements, myConversation, refresh, loading } = useContestConversations(
    contestId,
    { role: 'student', pollIntervalMs: 30_000 },
  );
  const { unreadAnnouncementIds, unreadMessageIds, markRead } = useContestUnread({
    contestId, role: 'student',
    announcements, conversations: [], myConversation,
  });

  useEffect(() => {
    if (myConversation && unreadMessageIds.length) {
      markRead(unreadMessageIds.map((id) => `msg:${id}`));
    }
  }, [myConversation?.id, unreadMessageIds.join(','), markRead]);

  if (loading) return <div>載入中...</div>;

  const handleSend = async (content: string) => {
    if (!myConversation) {
      await createStudentConversation(contestId, content);
    } else {
      await appendMessage(contestId, myConversation.id, content);
    }
    await refresh();
  };

  const canPost = !contestEnded && !contestNotStarted;
  const hint = contestNotStarted
    ? '考試開始後可發問'
    : contestEnded
      ? '考試已結束，無法繼續對話'
      : undefined;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <ContestAnnouncementList
        announcements={announcements}
        unreadIds={new Set(unreadAnnouncementIds)}
        onMarkRead={(keys) => markRead(keys)}
      />
      <section>
        <h4 style={{ marginTop: 0 }}>與老師對話</h4>
        <ConversationThreadView
          conversation={myConversation}
          viewerRole="student"
          canPost={canPost}
          disabledHint={hint}
          emptyHint="尚無訊息，可在下方輸入框開始你的提問"
          onSend={handleSend}
        />
      </section>
    </div>
  );
};

export default StudentDiscussionView;
```

- [ ] **Step 2：建 AdminDiscussionView**

```tsx
// frontend/src/features/contest/components/discussion/AdminDiscussionView.tsx
import { useEffect, useMemo, useState } from 'react';
import { Dropdown } from '@carbon/react';
import {
  ContestAnnouncementList,
  ContestConversationList,
  ConversationThreadView,
  PostAnnouncementModal,
} from '@/features/contest/components/discussion';
import { useContestConversations } from '@/features/contest/hooks/useContestConversations';
import {
  appendMessage,
  createContestAnnouncement,
  deleteContestAnnouncement,
  getConversation,
} from '@/infrastructure/api/repositories';
import type { ContestConversation } from '@/core/entities/contest.entity';

interface Props {
  contestId: string;
  initialAwaiting?: 'teacher' | 'student' | undefined;
}

type AwaitingFilter = 'all' | 'teacher' | 'student';

export const AdminDiscussionView = ({ contestId, initialAwaiting }: Props) => {
  const [filter, setFilter] = useState<AwaitingFilter>(initialAwaiting ?? 'all');
  const apiAwaiting = filter === 'all' ? undefined : filter;
  const { announcements, conversations, refresh, loading } = useContestConversations(
    contestId,
    { role: 'teacher', pollIntervalMs: 30_000, awaiting: apiAwaiting },
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<ContestConversation | null>(null);
  const [annModalOpen, setAnnModalOpen] = useState(false);

  useEffect(() => {
    if (!selectedId) { setSelectedDetail(null); return; }
    let cancelled = false;
    getConversation(contestId, selectedId).then((d) => {
      if (!cancelled) setSelectedDetail(d);
    });
    return () => { cancelled = true; };
  }, [contestId, selectedId, conversations.length]);

  const handleSend = async (content: string) => {
    if (!selectedDetail) return;
    await appendMessage(contestId, selectedDetail.id, content);
    const fresh = await getConversation(contestId, selectedDetail.id);
    setSelectedDetail(fresh);
    await refresh();
  };

  const filterItems = useMemo(
    () => [
      { id: 'all', label: '全部' },
      { id: 'teacher', label: '未回' },
      { id: 'student', label: '已回' },
    ],
    [],
  );

  if (loading) return <div>載入中...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <ContestAnnouncementList
        announcements={announcements}
        unreadIds={new Set()}
        canDelete
        onMarkRead={() => {}}
        onDelete={async (id) => {
          await deleteContestAnnouncement(contestId, id);
          await refresh();
        }}
        showCreateButton
        onCreate={() => setAnnModalOpen(true)}
      />

      <section>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem' }}>
          <h4 style={{ margin: 0 }}>學生對話</h4>
          <Dropdown
            id="conv-filter"
            label="篩選"
            titleText=""
            size="sm"
            items={filterItems}
            itemToString={(i) => i?.label ?? ''}
            selectedItem={filterItems.find((i) => i.id === filter)}
            onChange={({ selectedItem }) => selectedItem && setFilter(selectedItem.id as AwaitingFilter)}
          />
        </header>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 2fr)', gap: '1rem' }}>
          <ContestConversationList
            conversations={conversations}
            selectedId={selectedId}
            onSelect={(c) => setSelectedId(c.id)}
          />
          <div>
            {selectedDetail ? (
              <ConversationThreadView
                conversation={selectedDetail}
                viewerRole="teacher"
                canPost
                onSend={handleSend}
              />
            ) : (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--cds-text-secondary)' }}>
                請選擇左側對話
              </div>
            )}
          </div>
        </div>
      </section>

      <PostAnnouncementModal
        open={annModalOpen}
        onClose={() => setAnnModalOpen(false)}
        onSubmit={async (title, content) => {
          await createContestAnnouncement(contestId, { title, content });
          await refresh();
        }}
      />
    </div>
  );
};

export default AdminDiscussionView;
```

- [ ] **Step 3：補進 `discussion/index.ts`**

```typescript
export { default as StudentDiscussionView } from './StudentDiscussionView';
export { default as AdminDiscussionView } from './AdminDiscussionView';
```

- [ ] **Step 4：型別檢查 + Commit**

```bash
cd frontend && npm run -s typecheck
git add frontend/src/features/contest/components/discussion/
git commit -m "feat(contest): Student/Admin discussion view composers"
```

---

## Phase 4：Notification Bell

### Task 15: ContestNotificationModal

**Files:**
- Create: `frontend/src/features/contest/components/notification/ContestNotificationModal.tsx`

- [ ] **Step 1：實作**

```tsx
// frontend/src/features/contest/components/notification/ContestNotificationModal.tsx
import { Modal, Tag } from '@carbon/react';
import type { ContestAnnouncement, ContestMessage } from '@/core/entities/contest.entity';

interface Props {
  open: boolean;
  unreadAnnouncements: ContestAnnouncement[];
  unreadMessages: ContestMessage[];
  onMarkAllRead: () => void;
  onClose: () => void;
  onGoToDiscussion: () => void;
}

export const ContestNotificationModal = ({
  open, unreadAnnouncements, unreadMessages,
  onMarkAllRead, onClose, onGoToDiscussion,
}: Props) => {
  const handleClose = () => {
    onMarkAllRead();
    onClose();
  };
  const handleSecondary = () => {
    onMarkAllRead();
    onGoToDiscussion();
    onClose();
  };

  return (
    <Modal
      open={open}
      modalHeading="未讀通知"
      primaryButtonText="我已閱讀"
      secondaryButtonText="前往討論"
      onRequestClose={handleClose}
      onRequestSubmit={handleClose}
      onSecondarySubmit={handleSecondary}
    >
      <section style={{ marginBottom: '1.5rem' }}>
        <h5 style={{ marginTop: 0 }}>新公告（{unreadAnnouncements.length}）</h5>
        {unreadAnnouncements.length === 0 ? (
          <p style={{ color: 'var(--cds-text-secondary)' }}>無</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {unreadAnnouncements.map((a) => (
              <li key={a.id}>
                <strong>{a.title}</strong>
                <p style={{ margin: '0.25rem 0', whiteSpace: 'pre-wrap' }}>{a.content}</p>
                <small style={{ color: 'var(--cds-text-secondary)' }}>{new Date(a.createdAt).toLocaleString()}</small>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h5 style={{ margin: '0 0 0.5rem 0' }}>新訊息（{unreadMessages.length}）</h5>
        {unreadMessages.length === 0 ? (
          <p style={{ color: 'var(--cds-text-secondary)' }}>無</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {unreadMessages.map((m) => (
              <li key={m.id}>
                <Tag size="sm" type="cyan">老師</Tag>{' '}
                <span>{m.content}</span>
                <div><small style={{ color: 'var(--cds-text-secondary)' }}>{new Date(m.createdAt).toLocaleString()}</small></div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Modal>
  );
};

export default ContestNotificationModal;
```

- [ ] **Step 2：型別檢查 + Commit**

```bash
cd frontend && npm run -s typecheck
git add frontend/src/features/contest/components/notification/ContestNotificationModal.tsx
git commit -m "feat(contest): ContestNotificationModal for student bell"
```

---

### Task 16: ContestNotificationBell

**Files:**
- Create: `frontend/src/features/contest/components/notification/ContestNotificationBell.tsx`
- Create: `frontend/src/features/contest/components/notification/ContestNotificationBell.module.scss`

- [ ] **Step 1：實作**

```tsx
// frontend/src/features/contest/components/notification/ContestNotificationBell.tsx
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HeaderGlobalAction } from '@carbon/react';
import { Notification } from '@carbon/icons-react';
import { useContestConversations } from '@/features/contest/hooks/useContestConversations';
import { useContestUnread } from '@/features/contest/hooks/useContestUnread';
import { ContestNotificationModal } from './ContestNotificationModal';
import styles from './ContestNotificationBell.module.scss';

interface Props {
  contestId: string;
  /** 'student' | 'teacher' */
  role: 'student' | 'teacher';
  /** path to navigate teachers when bell clicked, e.g. /admin/conversations?awaiting=teacher */
  teacherClickPath: string;
  /** path to navigate students from "前往討論" */
  studentDiscussionPath: string;
}

export const ContestNotificationBell = ({
  contestId, role, teacherClickPath, studentDiscussionPath,
}: Props) => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const awaiting = role === 'teacher' ? ('teacher' as const) : undefined;
  const { announcements, conversations, myConversation } = useContestConversations(
    contestId,
    { role, pollIntervalMs: 30_000, awaiting },
  );

  const { unreadAnnouncementIds, unreadMessageIds, unreadCount, markAllRead } =
    useContestUnread({ contestId, role, announcements, conversations, myConversation });

  const unreadAnnouncements = useMemo(
    () => announcements.filter((a) => unreadAnnouncementIds.includes(a.id)),
    [announcements, unreadAnnouncementIds],
  );
  const unreadMessages = useMemo(
    () => (myConversation?.messages ?? []).filter((m) => unreadMessageIds.includes(m.id)),
    [myConversation?.messages, unreadMessageIds],
  );

  const badgeText = unreadCount === 0 ? null : unreadCount > 9 ? '9+' : String(unreadCount);

  const handleClick = () => {
    if (role === 'teacher') {
      navigate(teacherClickPath);
    } else {
      setOpen(true);
    }
  };

  return (
    <>
      <HeaderGlobalAction aria-label="通知" tooltipAlignment="center" onClick={handleClick}>
        <span className={styles.iconWrapper}>
          <Notification size={20} />
          {badgeText && <span className={styles.badge}>{badgeText}</span>}
        </span>
      </HeaderGlobalAction>
      {role === 'student' && (
        <ContestNotificationModal
          open={open}
          unreadAnnouncements={unreadAnnouncements}
          unreadMessages={unreadMessages}
          onClose={() => setOpen(false)}
          onMarkAllRead={markAllRead}
          onGoToDiscussion={() => navigate(studentDiscussionPath)}
        />
      )}
    </>
  );
};

export default ContestNotificationBell;
```

- [ ] **Step 2：建立 SCSS**

```scss
// frontend/src/features/contest/components/notification/ContestNotificationBell.module.scss
.iconWrapper { position: relative; display: inline-flex; }
.badge {
  position: absolute;
  top: -0.25rem; right: -0.5rem;
  min-width: 1.1rem; height: 1.1rem;
  padding: 0 0.25rem;
  background: var(--cds-support-error);
  color: var(--cds-text-on-color);
  border-radius: 0.55rem;
  font-size: 0.6875rem;
  line-height: 1.1rem;
  text-align: center;
  font-weight: 600;
}
```

- [ ] **Step 3：建 `notification/index.ts`**

```typescript
export { default as ContestNotificationBell } from './ContestNotificationBell';
export { default as ContestNotificationModal } from './ContestNotificationModal';
```

- [ ] **Step 4：Commit**

```bash
git add frontend/src/features/contest/components/notification/
git commit -m "feat(contest): ContestNotificationBell with badge"
```

---

### Task 17: 在 ContestLayout 掛上鈴鐺

**Files:**
- Modify: `frontend/src/features/contest/components/layout/ContestLayout.tsx`

- [ ] **Step 1：在 import 區塊加上 Bell 與 path 構造器**

開啟 `frontend/src/features/contest/components/layout/ContestLayout.tsx`：

```typescript
import { ContestNotificationBell } from '@/features/contest/components/notification';
```

- [ ] **Step 2：在 `<HeaderGlobalBar>` 內 `{renderExamStatus()}` 之後、`{headerActions}` 之前插入 Bell**

定位 `frontend/src/features/contest/components/layout/ContestLayout.tsx:425` 的 `{renderExamStatus()}` 行，下方插入：

```tsx
{contestId && (
  <ContestNotificationBell
    contestId={contestId}
    role={isAdmin ? 'teacher' : 'student'}
    teacherClickPath={`${adminPath}/conversations?awaiting=teacher`}
    studentDiscussionPath={`${dashboardPath}/qa`}
  />
)}
```

> 路徑請依現有 routing 命名調整：若 dashboard 的 Q&A 子路徑與此不同，於 Task 19 接線時一併修正。

- [ ] **Step 3：手動驗證**

```bash
cd frontend && npm run dev
```

開瀏覽器到任一 contest，確認頂部 navbar 出現鈴鐺 icon；製造 1 筆未讀公告（用後端 admin 介面或 seed），重整看到紅色 badge。

- [ ] **Step 4：Commit**

```bash
git add frontend/src/features/contest/components/layout/ContestLayout.tsx
git commit -m "feat(contest): mount notification bell in ContestLayout header"
```

---

## Phase 5：Wire Up Screens

### Task 18: ContestQAScreen 改用 StudentDiscussionView

**Files:**
- Modify: `frontend/src/features/contest/screens/ContestQAScreen.tsx`

- [ ] **Step 1：重寫整檔**

```tsx
// frontend/src/features/contest/screens/ContestQAScreen.tsx
import { useParams } from 'react-router-dom';
import { useContext } from 'react';
import { ContestContext } from '@/features/contest/contexts/ContestContext';
import { StudentDiscussionView } from '@/features/contest/components/discussion';

export const ContestQAScreen = () => {
  const { contestId } = useParams<{ contestId: string }>();
  const { contest } = useContext(ContestContext);
  const now = Date.now();
  const contestEnded = !!contest?.endTime && new Date(contest.endTime).getTime() < now;
  const contestNotStarted = !!contest?.startTime && new Date(contest.startTime).getTime() > now;

  if (!contestId) return null;

  return (
    <StudentDiscussionView
      contestId={contestId}
      contestEnded={contestEnded}
      contestNotStarted={contestNotStarted}
    />
  );
};

export default ContestQAScreen;
```

> 若 `ContestContext` API 與本檔假設不符（例如 `contest` 欄位不在 context 裡），改用既有 `useContestLayoutState` hook 取得 contest。透過 `grep -n "ContestContext" frontend/src/features/contest/contexts/ContestContext.tsx` 確認。

- [ ] **Step 2：型別檢查 + Commit**

```bash
cd frontend && npm run -s typecheck
git add frontend/src/features/contest/screens/ContestQAScreen.tsx
git commit -m "refactor(contest): ContestQAScreen uses StudentDiscussionView"
```

---

### Task 19: AdminClarificationsScreen → AdminConversationsScreen

**Files:**
- Rename + Rewrite: `frontend/src/features/contest/screens/admin/panels/AdminClarificationsScreen.tsx` → `AdminConversationsScreen.tsx`
- Modify: `frontend/src/features/contest/modules/AdminPanelRendererRegistry.tsx`
- Modify: 其他 hardcoded `clarifications` key 處（grep 確認）
- Delete: `frontend/src/features/contest/screens/admin/panels/AdminClarificationsPanel.module.scss`（內容若不再使用）

- [ ] **Step 1：建立新檔 `AdminConversationsScreen.tsx`**

```tsx
// frontend/src/features/contest/screens/admin/panels/AdminConversationsScreen.tsx
import { useParams, useSearchParams } from 'react-router-dom';
import { AdminDiscussionView } from '@/features/contest/components/discussion';

export const AdminConversationsScreen = () => {
  const { contestId } = useParams<{ contestId: string }>();
  const [params] = useSearchParams();
  const awaiting = params.get('awaiting');
  const initial = awaiting === 'teacher' || awaiting === 'student' ? awaiting : undefined;

  if (!contestId) return null;
  return <AdminDiscussionView contestId={contestId} initialAwaiting={initial} />;
};

export default AdminConversationsScreen;
```

- [ ] **Step 2：刪除舊檔**

```bash
rm frontend/src/features/contest/screens/admin/panels/AdminClarificationsScreen.tsx
rm frontend/src/features/contest/screens/admin/panels/AdminClarificationsPanel.module.scss
```

- [ ] **Step 3：更新 panel registry**

`frontend/src/features/contest/modules/AdminPanelRendererRegistry.tsx`：

```typescript
import AdminConversationsScreen from '../screens/admin/panels/AdminConversationsScreen';

const registry = {
  // ...existing entries...
  conversations: AdminConversationsScreen,
};
```

刪除舊 key `clarifications`。

- [ ] **Step 4：搜尋 hardcoded `clarifications` 字串**

```bash
grep -rn "clarifications" frontend/src/features/contest/ --include="*.tsx" --include="*.ts" | grep -v node_modules
```

針對每處 hit：tab config / route / breadcrumb 等，把 `clarifications` 改為 `conversations`，label 與 i18n key 一併調整。

- [ ] **Step 5：型別檢查 + 啟動 dev 確認 admin panel 可載入**

```bash
cd frontend && npm run -s typecheck
```

- [ ] **Step 6：Commit**

```bash
git add -A frontend/src/features/contest/screens/admin/panels/ frontend/src/features/contest/modules/AdminPanelRendererRegistry.tsx
git commit -m "refactor(contest): rename Clarifications panel to Conversations"
```

---

### Task 20: AdminProctoringPanel 加「傳送訊息」按鈕

**Files:**
- Modify: `frontend/src/features/contest/screens/admin/panels/AdminProctoringPanel.tsx`

- [ ] **Step 1：閱讀現有檔案找出每個學生卡片渲染處**

```bash
grep -n "participant\|student\|map(" frontend/src/features/contest/screens/admin/panels/AdminProctoringPanel.tsx | head -30
```

- [ ] **Step 2：在學生卡片操作區追加按鈕**

於 student card 渲染區的動作 / button row 加入：

```tsx
import { useState } from 'react';
import { Button } from '@carbon/react';
import { Email } from '@carbon/icons-react';
import { SendMessageModal } from '@/features/contest/components/discussion';
import { sendMessageToStudent } from '@/infrastructure/api/repositories';

// inside the row:
const [msgOpenFor, setMsgOpenFor] = useState<{ id: string; username: string } | null>(null);

<Button
  kind="ghost"
  size="sm"
  renderIcon={Email}
  onClick={() => setMsgOpenFor({ id: participant.user.id, username: participant.user.username })}
>
  傳送訊息
</Button>

<SendMessageModal
  open={!!msgOpenFor}
  recipientUsername={msgOpenFor?.username ?? ''}
  onClose={() => setMsgOpenFor(null)}
  onSubmit={async (content) => {
    if (!msgOpenFor) return;
    await sendMessageToStudent(contestId, msgOpenFor.id, content);
  }}
/>
```

> 實際 import path 與型別欄位（`participant.user.id`）請依該檔現有資料結構調整。

- [ ] **Step 3：型別檢查 + 手動測試**

```bash
cd frontend && npm run -s typecheck
```

打開 dev server，登入教師帳號 → contest admin → 監考面板 → 對任一學生點「傳送訊息」 → 送出 → 切到學生帳號（另一瀏覽器）查看鈴鐺與 dashboard。

- [ ] **Step 4：Commit**

```bash
git add frontend/src/features/contest/screens/admin/panels/AdminProctoringPanel.tsx
git commit -m "feat(contest): proctoring panel can send direct message to student"
```

---

## Phase 6：Cleanup

### Task 21: 刪除既有 ContestClarifications / 相關元件 / 舊 hook

**Files:**
- Delete: `frontend/src/features/contest/components/ContestClarifications.tsx`
- Delete: `frontend/src/features/contest/components/AnnouncementSectionLayout.tsx`
- Delete: `frontend/src/features/contest/components/DiscussionsSection.tsx`
- Delete: `frontend/src/features/contest/hooks/useClarifications.ts`
- Modify: `frontend/src/features/contest/components/index.ts`

- [ ] **Step 1：搜尋殘餘 import**

```bash
grep -rn "ContestClarifications\|AnnouncementSectionLayout\|DiscussionsSection\|useClarifications" frontend/src --include="*.ts" --include="*.tsx" | grep -v node_modules
```

- [ ] **Step 2：對每個 hit 改寫或刪除引用**

預期僅剩 `frontend/src/features/contest/components/index.ts` 中的 re-export，整段刪除。其他若有則改為新元件。

- [ ] **Step 3：刪除檔案**

```bash
rm frontend/src/features/contest/components/ContestClarifications.tsx \
   frontend/src/features/contest/components/AnnouncementSectionLayout.tsx \
   frontend/src/features/contest/components/DiscussionsSection.tsx \
   frontend/src/features/contest/hooks/useClarifications.ts
```

- [ ] **Step 4：型別檢查 + lint**

```bash
cd frontend && npm run -s typecheck && npm run -s lint
```

Expected：無錯誤。

- [ ] **Step 5：Commit**

```bash
git add -A frontend/src/features/contest/
git commit -m "chore(contest): remove legacy Clarifications components and hook"
```

---

### Task 22: i18n 與最終驗收

**Files:**
- Modify: `frontend/src/locales/*` 或對應 i18n 檔（依專案結構）

- [ ] **Step 1：執行 i18n 同步**

```bash
cd frontend && npm run sync:i18n && npm run check:i18n
```

Expected：通過。

- [ ] **Step 2：執行完整 backend 測試**

```bash
bash .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T -e PYTEST_ADDOPTS='--no-cov' backend pytest apps/contests/tests/ -v
```

Expected：所有 contest 測試（含本次新增）通過；舊 Clarification 測試應已隨 Task 2 一併移除（如有殘留請刪除）。

- [ ] **Step 3：執行 frontend 單元測試**

```bash
cd frontend && npm test
```

Expected：所有測試通過，特別是 `contestReadStorage.test.ts` 與 `useContestUnread.test.ts`。

- [ ] **Step 4：手動 E2E 驗收清單**

依序在瀏覽器驗證：

- [ ] 學生登入 → contest → navbar 鈴鐺顯示未讀公告 badge
- [ ] 點鈴鐺 → modal 列出公告與訊息 → 「我已閱讀」後 badge 消失
- [ ] 學生 dashboard Q&A tab → 上半公告、下半對話 thread；無對話時顯示 empty hint
- [ ] 學生輸入訊息送出 → 出現在 thread 中 → 重整仍在
- [ ] 教師登入 → contest admin → 對話面板 filter 「未回」運作
- [ ] 教師回覆 → 學生鈴鐺 badge 出現 → modal 顯示新訊息
- [ ] 教師 proctoring panel 對學生送訊息 → 學生 dashboard 看到該訊息
- [ ] 競賽結束（手動把 end_time 改為過去）：學生 thread 輸入框 disabled，hint 顯示

- [ ] **Step 5：Commit i18n 變更（若有）**

```bash
git add -A
git diff --cached --stat
git commit -m "chore(contest): sync i18n & verify full conversation flow"
```

---

## 自我審查

1. **Spec 覆蓋檢查**
   - §A 資料模型 → Task 1
   - §B localStorage 已讀 → Task 7
   - §C useContestUnread → Task 9
   - §D navbar 鈴鐺 → Task 15-17
   - §E Q&A tab + thread → Task 10-11, 14, 18
   - §F 權限狀態 → Task 4 後端 + Task 14 前端輸入框 disabled
   - §G.1 教師面板 + filter → Task 12, 14, 19
   - §G.2 Proctoring 傳送訊息 → Task 20
   - §H 元件拆檔 → Task 10-14
   - §I 後端 → Task 1-5

2. **Placeholder 檢查**：每段 step 皆含完整代碼或精確命令，無 TBD / TODO。Task 19 / 20 留有「依現有結構微調」的彈性註記，但動作描述明確（grep + 取代 hardcoded key）。

3. **型別一致性**：`ContestConversation` / `ContestMessage` / `senderRole` / `firstSenderRole` 的命名在 Task 6 定義後，Task 8-20 皆延用。後端 `last_message` / `first_sender_role` 與前端 `lastMessage` / `firstSenderRole` 一一對應（mapper 在 Task 6 處理）。
