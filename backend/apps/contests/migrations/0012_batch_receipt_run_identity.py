"""Keep historical run receipts so recovery cannot restore a revoked grade."""
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('contests', '0011_batch_grade_write_receipts')]

    operations = [
        migrations.AlterField(
            model_name='exambatchgradewrite', name='answer',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,
                                    related_name='batch_writes', to='contests.examanswer'),
        ),
        migrations.AddConstraint(
            model_name='exambatchgradewrite',
            constraint=models.UniqueConstraint(fields=('answer', 'session_id', 'run_id'),
                                               name='unique_batch_run_answer_write'),
        ),
    ]
