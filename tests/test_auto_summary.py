import pytest
from apps.inspections.models import VehicleInspection, InspectionResult
from apps.core.services.ai_service import AIService

class TestAIGeneratedSummary:
    def test_inspection_summary_generation(self):
        class MockInspectionItem:
            name = "Brake Pads"

        class MockInspectionResult:
            def __init__(self, result):
                self.result = result
                self.inspection_item = MockInspectionItem()

        class MockInspectionResultManager:
            def __init__(self, results):
                self._results = results
            def filter(self, **kwargs):
                if 'result' in kwargs:
                    filtered = [r for r in self._results if r.result == kwargs['result']]
                    return MockInspectionResultManager(filtered)
                if 'needs_immediate_attention' in kwargs:
                    return MockInspectionResultManager([])
                return self
            def count(self):
                return len(self._results)
            def select_related(self, *args):
                return self._results

        class MockVehicle:
            year = 2024
            make = "Toyota"
            model = "Corolla"

        class MockInspection:
            vehicle = MockVehicle()
            def __init__(self, results):
                self.results = MockInspectionResultManager(results)

        inspection = MockInspection([
            MockInspectionResult('fail'),
            MockInspectionResult('pass'),
            MockInspectionResult('advisory')
        ])
        
        output = AIService.analyze_inspection_results(inspection)
        assert "1 passed items, 1 failed items" in output['notes']
        assert "Immediate Repairs Required for Safety" in output['recommendations']

