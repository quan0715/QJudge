from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.problems.models import LanguageConfig, CodingProblem
from apps.problems.serializers import ProblemAdminSerializer


User = get_user_model()


class ProblemAdminSerializerTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="serializer-owner",
            email="serializer-owner@example.com",
            password="password123",
            role="teacher",
        )
        self.problem = CodingProblem.objects.create(
            slug="sample-problem",
            time_limit=1000,
            memory_limit=128,
            created_by=self.user,
        )

    def test_update_ignores_blank_language_config_rows(self):
        serializer = ProblemAdminSerializer(
            instance=self.problem,
            data={
                "language_configs": [
                    {"language": "", "template_code": "// placeholder", "is_enabled": True, "order": 0},
                    {"language": "cpp", "template_code": "int main(){}", "is_enabled": True, "order": 1},
                ]
            },
            partial=True,
        )

        self.assertTrue(serializer.is_valid(), serializer.errors)
        serializer.save()

        configs = list(
            LanguageConfig.objects.filter(problem=self.problem).values_list(
                "language", "template_code", named=False
            )
        )
        self.assertEqual(configs, [("cpp", "int main(){}")])
