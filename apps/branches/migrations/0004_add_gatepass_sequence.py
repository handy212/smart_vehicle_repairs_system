# Generated manually for Gate Pass module

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('branches', '0003_add_proforma_numbering'),
    ]

    operations = [
        migrations.AddField(
            model_name='branch',
            name='next_gatepass_number',
            field=models.PositiveIntegerField(default=1, help_text='Next sequential number for gate passes', verbose_name='next gate pass number'),
        ),
    ]
