from django.core.management.base import BaseCommand
from apps.accounts.admin_models import SystemModule
from apps.accounts.management.commands._auditlog_utils import disable_auditlog

class Command(BaseCommand):
    help = 'Seed initial system modules'

    def handle(self, *args, **options):
        with disable_auditlog():
            self._do_seed()

    def _do_seed(self):
        modules = [
            {'name': 'Dashboard', 'slug': 'dashboard', 'is_enabled': True, 'icon': 'Dashboard', 'description': 'Main system dashboard'},
            {'name': 'Customers', 'slug': 'customers', 'is_enabled': True, 'icon': 'Users', 'description': 'Customer management'},
            {'name': 'Vehicles', 'slug': 'vehicles', 'is_enabled': True, 'icon': 'Car', 'description': 'Vehicle management'},
            {'name': 'Appointments', 'slug': 'appointments', 'is_enabled': True, 'icon': 'Calendar', 'description': 'Appointment scheduling'},
            {'name': 'Work Orders', 'slug': 'workorders', 'is_enabled': True, 'icon': 'Wrench', 'description': 'Work order management'},
            {'name': 'Gate Passes', 'slug': 'gatepass', 'is_enabled': True, 'icon': 'FileText', 'description': 'Gate pass management'},
            {'name': 'Roadside', 'slug': 'roadside', 'is_enabled': True, 'icon': 'Truck', 'description': 'Roadside assistance'},
            {'name': 'Technicians', 'slug': 'technicians', 'is_enabled': True, 'icon': 'UserCog', 'description': 'Technician management'},
            {'name': 'HR', 'slug': 'hr', 'is_enabled': True, 'icon': 'Building2', 'description': 'Human Resources management'},
            {'name': 'Parts & Stock', 'slug': 'inventory', 'is_enabled': True, 'icon': 'Package', 'description': 'Parts catalog and stock management'},
            {'name': 'Billing', 'slug': 'billing', 'is_enabled': True, 'icon': 'Receipt', 'description': 'Billing and invoicing'},
            {'name': 'Accounting', 'slug': 'accounting', 'is_enabled': True, 'icon': 'Calculator', 'description': 'Accounting and financial reports'},
            {'name': 'Fixed Assets', 'slug': 'fixed-assets', 'is_enabled': True, 'icon': 'Landmark', 'description': 'Fixed asset tracking'},
            {'name': 'Subscriptions', 'slug': 'subscriptions', 'is_enabled': True, 'icon': 'CreditCard', 'description': 'Subscription management'},
            {'name': 'Inspections', 'slug': 'inspections', 'is_enabled': True, 'icon': 'FileText', 'description': 'Vehicle inspections'},
            {'name': 'Diagnosis', 'slug': 'diagnosis', 'is_enabled': True, 'icon': 'Stethoscope', 'description': 'Vehicle diagnosis'},
            {'name': 'Reports', 'slug': 'reports', 'is_enabled': True, 'icon': 'BarChart', 'description': 'System-wide reports'},
            {'name': 'Messages', 'slug': 'sms', 'is_enabled': True, 'icon': 'MessageSquare', 'description': 'SMS and customer messaging'},
            {'name': 'Live Chat', 'slug': 'chat', 'is_enabled': True, 'icon': 'MessageSquare', 'description': 'Real-time communication between staff, technicians, and clients'},
        ]

        for module_data in modules:
            module, created = SystemModule.objects.get_or_create(
                slug=module_data['slug'],
                defaults=module_data
            )
            if created:
                self.stdout.write(self.style.SUCCESS(f"Created module: {module.name}"))
            else:
                # Sync display fields without re-enabling a disabled module
                changed_fields = []
                for field in ("name", "description", "icon"):
                    if getattr(module, field) != module_data[field]:
                        setattr(module, field, module_data[field])
                        changed_fields.append(field)
                if changed_fields:
                    module.save(update_fields=changed_fields)
                    self.stdout.write(self.style.SUCCESS(f"Updated module: {module.name}"))
                else:
                    self.stdout.write(self.style.WARNING(f"Module already exists: {module.name}"))

        self.stdout.write(self.style.SUCCESS('Successfully seeded system modules'))
