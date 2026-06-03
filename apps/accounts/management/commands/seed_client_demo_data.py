from __future__ import annotations

import json

from django.core.management.base import BaseCommand

from apps.accounts.client_demo_data import MODULES, ClientDemoDataService


class Command(BaseCommand):
    help = "Load or purge client demo data without touching non-demo records."

    def add_arguments(self, parser):
        parser.add_argument("--count", type=int, default=100, help="Primary demo records per module.")
        parser.add_argument(
            "--module",
            action="append",
            choices=MODULES,
            help="Limit to one module. Can be supplied more than once.",
        )
        parser.add_argument(
            "--purge",
            action="store_true",
            help="Purge demo records instead of loading them.",
        )
        parser.add_argument(
            "--permanent",
            action="store_true",
            help="With --purge, delete real module data instead of demo-marked records only.",
        )
        parser.add_argument(
            "--confirm-permanent",
            action="store_true",
            help="Required with --purge --permanent.",
        )
        parser.add_argument(
            "--status",
            action="store_true",
            help="Show demo record status instead of loading data.",
        )
        parser.add_argument(
            "--json",
            action="store_true",
            help="Output machine-readable JSON.",
        )

    def handle(self, *args, **options):
        service = ClientDemoDataService(count=options["count"])
        modules = options.get("module")

        if options["status"]:
            result = service.status(modules)
        elif options["purge"]:
            if options["permanent"] and not options["confirm_permanent"]:
                raise SystemExit("--purge --permanent requires --confirm-permanent")
            result = service.purge(modules, permanent=options["permanent"])
        else:
            result = service.load(modules)

        if options["json"]:
            self.stdout.write(json.dumps(result, indent=2, default=str))
            return

        self.stdout.write(self.style.SUCCESS(f"Client demo data {result['action']}:"))
        for item in result["modules"]:
            self.stdout.write(
                "  {module}: target={target} created={created} existing={existing} purged={purged} skipped={skipped}".format(
                    **item
                )
            )
            for warning in item["warnings"]:
                self.stdout.write(self.style.WARNING(f"    warning: {warning}"))
            for error in item["errors"]:
                self.stdout.write(self.style.ERROR(f"    error: {error}"))
