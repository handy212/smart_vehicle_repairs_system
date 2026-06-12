from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("workorders", "0036_workorder_customer_rating_feedback"),
    ]

    operations = [
        migrations.AlterField(
            model_name="workordernote",
            name="note_type",
            field=models.CharField(
                choices=[
                    ("internal", "Internal Note"),
                    ("status", "Stage / Status Note"),
                    ("customer", "Customer Communication"),
                    ("technician", "Technician Note"),
                    ("parts", "Parts Note"),
                    ("approval", "Approval Note"),
                    ("quality", "Quality Check Note"),
                    ("general", "General"),
                ],
                default="general",
                max_length=20,
            ),
        ),
    ]
