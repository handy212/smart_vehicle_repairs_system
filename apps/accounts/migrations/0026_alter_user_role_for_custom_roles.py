from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0025_systemupdaterun'),
    ]

    operations = [
        migrations.AlterField(
            model_name='user',
            name='role',
            field=models.CharField(
                default='customer',
                max_length=50,
                verbose_name='role',
            ),
        ),
    ]
