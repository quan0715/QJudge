import io

from django.test import SimpleTestCase

from apps.classrooms.services.gradebook import (
    Gradebook,
    GradebookContest,
    GradebookStudent,
    write_gradebook_csv,
)


class WriteGradebookCsvTests(SimpleTestCase):
    def test_header_scores_and_blank_for_absent(self):
        gb = Gradebook(
            contests=[
                GradebookContest(1, 'Lab 1', 'coding', None, 300.0),
                GradebookContest(2, '期中考, 上', 'paper_exam', None, 120.0),
            ],
            students=[
                GradebookStudent(10, '110550001', '王小明', {1: 300.0, 2: 96.5}),
                GradebookStudent(11, '110550002', '', {1: 0.0, 2: None}),
            ],
        )
        out = io.StringIO()
        write_gradebook_csv(gb, out)
        self.assertEqual(out.getvalue().splitlines(), [
            '帳號,姓名,Lab 1（滿分 300.00）,"期中考, 上（滿分 120.00）"',
            '110550001,王小明,300.00,96.50',
            '110550002,,0.00,',
        ])
