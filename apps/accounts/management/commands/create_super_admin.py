from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from apps.accounts.permission_models import Role, Permission

User = get_user_model()

class Command(BaseCommand):
    help = 'Create super-admin role and user'

    def handle(self, *args, **options):
        # 1. Create super-admin role
        role, created = Role.objects.get_or_create(
            code='super-admin',
            defaults={
                'name': 'Super Admin',
                'description': 'Root level access. Invisible to other admins.',
                'is_system': True,
                'priority': 1000
            }
        )
        if created:
            # Grant all permissions to super-admin
            all_permissions = Permission.objects.all()
            role.permissions.set(all_permissions)
            self.stdout.write(self.style.SUCCESS(f"Created role: {role.name}"))
        else:
            self.stdout.write(self.style.WARNING(f"Role already exists: {role.name}"))

        # 2. Create or promote super-admin user
        email = 'superadmin@system.com'
        user, created = User.objects.get_or_create(
            email=email,
            defaults={
                'username': 'superadmin',
                'first_name': 'Super',
                'last_name': 'Admin',
                'role': 'super-admin',
                'is_staff': True,
                'is_superuser': True,
            }
        )
        if created:
            user.set_password('SuperAdmin123!') # User should change this
            user.save()
            self.stdout.write(self.style.SUCCESS(f"Created super-admin user: {email}"))
        else:
            user.role = 'super-admin'
            user.is_superuser = True
            user.is_staff = True
            user.save()
            self.stdout.write(self.style.SUCCESS(f"Promoted user to super-admin: {email}"))

        self.stdout.write(self.style.SUCCESS('Super-admin setup completed'))
