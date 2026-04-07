"""
NotificationService — unified entry point for creating and dispatching
email notifications via Celery.
"""
import logging

from django.contrib.contenttypes.models import ContentType
from django.db.models import QuerySet
from django.template.loader import render_to_string

from .models import EmailNotification, NotificationType
from .tasks import send_email_notification

logger = logging.getLogger(__name__)


class NotificationService:
    """
    Creates EmailNotification records and dispatches Celery tasks.
    All notification entry points go through this service so that
    logging, recipient resolution, and template rendering are centralised.
    """

    @staticmethod
    def _render_email(template_name: str, context: dict) -> tuple[str, str]:
        """Return (text_body, html_body) rendered from Django templates."""
        html_body = render_to_string(f'emails/{template_name}.html', context)
        text_body = render_to_string(f'emails/{template_name}.txt', context)
        return text_body, html_body

    @staticmethod
    def send_notification(
        *,
        notification_type: str,
        recipients: QuerySet,
        subject: str,
        template_name: str,
        context: dict,
        source_object=None,
        triggered_by=None,
    ) -> list[EmailNotification]:
        """
        Create EmailNotification records for each recipient and enqueue
        Celery tasks to send them.
        """
        ct = None
        obj_id = None
        if source_object is not None:
            ct = ContentType.objects.get_for_model(source_object)
            obj_id = source_object.pk

        text_body, html_body = NotificationService._render_email(template_name, context)

        notifications = []
        for user in recipients.select_related('profile').iterator():
            if not user.email:
                logger.warning("Skipping user %s (id=%s): no email", user.username, user.pk)
                continue

            record = EmailNotification.objects.create(
                recipient=user,
                recipient_email=user.email,
                notification_type=notification_type,
                subject=subject,
                body_text=text_body,
                body_html=html_body,
                content_type=ct,
                object_id=obj_id,
                triggered_by=triggered_by,
            )
            send_email_notification.delay(str(record.pk))
            notifications.append(record)

        logger.info(
            "Dispatched %d %s notifications (subject=%r)",
            len(notifications), notification_type, subject,
        )
        return notifications

    @staticmethod
    def send_classroom_announcement_email(*, announcement, triggered_by=None):
        """
        Send email notification for a classroom announcement.
        Recipients: all ClassroomMembers + admins + owner.
        """
        from apps.classrooms.models import ClassroomMember
        from django.contrib.auth import get_user_model

        User = get_user_model()
        classroom = announcement.classroom

        member_user_ids = ClassroomMember.objects.filter(
            classroom=classroom,
        ).values_list('user_id', flat=True)

        admin_user_ids = classroom.admins.values_list('id', flat=True)

        all_user_ids = set(member_user_ids) | set(admin_user_ids) | {classroom.owner_id}
        recipients = User.objects.filter(id__in=all_user_ids)

        subject = f"[{classroom.name}] {announcement.title}"

        context = {
            'classroom_name': classroom.name,
            'announcement_title': announcement.title,
            'announcement_content': announcement.content,
            'author_name': (
                announcement.created_by.username
                if announcement.created_by else '系統'
            ),
        }

        return NotificationService.send_notification(
            notification_type=NotificationType.CLASSROOM_ANNOUNCEMENT,
            recipients=recipients,
            subject=subject,
            template_name='classroom_announcement',
            context=context,
            source_object=announcement,
            triggered_by=triggered_by,
        )
