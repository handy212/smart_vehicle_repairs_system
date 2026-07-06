from django.core.management.base import BaseCommand

from apps.workflows.services import seed_registered_workflows


class Command(BaseCommand):
    help = 'Seed default workflow definitions.'

    def handle(self, *args, **options):
        workflows = seed_registered_workflows()
        for workflow in workflows:
            self.stdout.write(
                self.style.SUCCESS(
                    f"Seeded workflow '{workflow.name}' with "
                    f"{workflow.states.count()} states and {workflow.transitions.count()} transitions."
                )
            )
