from django.db import migrations


def grant_customer_view_notifications(apps, schema_editor):
    Role = apps.get_model('accounts', 'Role')
    Permission = apps.get_model('accounts', 'Permission')
    try:
        permission = Permission.objects.get(code='view_notifications')
        role = Role.objects.get(code='customer')
    except (Permission.DoesNotExist, Role.DoesNotExist):
        return
    role.permissions.add(permission)


def revoke_customer_view_notifications(apps, schema_editor):
    Role = apps.get_model('accounts', 'Role')
    Permission = apps.get_model('accounts', 'Permission')
    try:
        permission = Permission.objects.get(code='view_notifications')
        role = Role.objects.get(code='customer')
    except (Permission.DoesNotExist, Role.DoesNotExist):
        return
    role.permissions.remove(permission)


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0023_alter_user_gender'),
    ]

    operations = [
        migrations.RunPython(
            grant_customer_view_notifications,
            revoke_customer_view_notifications,
        ),
    ]
