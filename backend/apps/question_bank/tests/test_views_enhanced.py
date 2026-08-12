from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from apps.question_bank.models import QuestionBank

User = get_user_model()

class QuestionBankViewsEnhancedTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(username='admin', email='admin@test.com', password='password123')
        self.admin.role = 'admin'
        self.admin.save()
        
        self.teacher = User.objects.create_user(username='teacher', email='teacher@test.com', password='password123', role='teacher')
        self.student = User.objects.create_user(username='student', email='student@test.com', password='password123', role='student')
        
        self.bank = QuestionBank.objects.create(
            name='Teacher Bank',
            owner=self.teacher,
            category='coding',
        )
        self.list_url = reverse('question_bank:question-bank-list')
        self.detail_url = reverse('question_bank:question-bank-detail', kwargs={'uuid': self.bank.uuid})

    def test_student_cannot_create_bank(self):
        """Test that students are denied from creating question banks"""
        self.client.force_authenticate(user=self.student)
        response = self.client.post(self.list_url, {'name': 'Student Bank', 'category': 'coding'})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_marketplace_actions_are_not_routed(self):
        """Retired Marketplace URLs must not retain callable API behavior."""
        self.client.force_authenticate(user=self.teacher)
        requests = [
            ("get", "/api/v1/question-banks/explore/"),
            ("get", "/api/v1/question-banks/review-queue/"),
            ("post", f"/api/v1/question-banks/{self.bank.uuid}/submit-for-review/"),
            ("post", f"/api/v1/question-banks/{self.bank.uuid}/review/"),
            ("post", f"/api/v1/question-banks/{self.bank.uuid}/subscribe/"),
            ("get", "/api/v1/question-banks/subscribed/"),
        ]

        for method, path in requests:
            with self.subTest(method=method, path=path):
                response = getattr(self.client, method)(path)
                self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_inbox_category_validation(self):
        """Test inbox endpoint with invalid category"""
        self.client.force_authenticate(user=self.teacher)
        inbox_url = reverse('question_bank:question-bank-inbox')
        response = self.client.get(inbox_url, {'category': 'invalid'})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_questions_category_mismatch(self):
        """Test creating a question with mismatched category for the bank"""
        self.client.force_authenticate(user=self.teacher)
        questions_url = reverse('question_bank:question-bank-questions', kwargs={'uuid': self.bank.uuid})
        
        # Bank is 'coding', try to add 'exam' question
        payload = {
            'question_type': 'exam',
            'title': 'Wrong Category',
            'content': '...'
        }
        response = self.client.post(questions_url, payload)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(response.data['success'])

    def test_destroy_bank_archives(self):
        """Test that destroying a bank archives it instead of deleting"""
        self.client.force_authenticate(user=self.teacher)
        url = reverse('question_bank:question-bank-detail', kwargs={'uuid': self.bank.uuid})
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.bank.refresh_from_db()
        self.assertTrue(self.bank.is_archived)
