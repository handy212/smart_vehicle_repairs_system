from django.test import SimpleTestCase


class MappingServicesImportTest(SimpleTestCase):
    def test_qbo_object_imports_do_not_all_fail_when_class_module_differs(self):
        """Account/Item/TaxCode imports must survive Class living under trackingclass."""
        from apps.quickbooks_online import mapping_services as ms

        self.assertIsNotNone(ms.QBAccount)
        self.assertIsNotNone(ms.QBItem)
        self.assertIsNotNone(ms.QBTaxCode)
        self.assertIsNotNone(ms.QBClass)
        self.assertIn(
            ms.QBClass.__module__,
            ("quickbooks.objects.trackingclass", "quickbooks.objects.class"),
        )
