#!/usr/bin/env python
"""
Test runner script for Smart Vehicle Repairs System.
"""
import os
import sys
import django
from django.conf import settings
from django.test.utils import get_runner

if __name__ == "__main__":
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.testing")
    os.environ.setdefault("DJANGO_ENVIRONMENT", "testing")
    
    django.setup()
    
    TestRunner = get_runner(settings)
    test_runner = TestRunner()
    
    if len(sys.argv) > 1:
        # Run specific tests
        failures = test_runner.run_tests(sys.argv[1:])
    else:
        # Run all tests
        failures = test_runner.run_tests([
            "apps.accounts.tests",
            "apps.vehicles.tests", 
            "apps.workorders.tests"
        ])
    
    if failures:
        sys.exit(bool(failures))