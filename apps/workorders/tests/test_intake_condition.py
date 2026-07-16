from django.test import SimpleTestCase

from apps.workorders.intake_condition import (
    _format_result_text,
    _map_battery_choice,
    extract_intake_from_inspection,
)


class _FakeItem:
    def __init__(self, name: str):
        self.name = name


class _FakeResult:
    def __init__(
        self,
        *,
        name: str,
        result: str = 'pass',
        condition: str = '',
        rating_value=None,
        text_note: str = '',
        recommendation: str = '',
        needs_immediate_attention: bool = False,
    ):
        self.inspection_item = _FakeItem(name)
        self.result = result
        self.condition = condition
        self.rating_value = rating_value
        self.text_note = text_note
        self.recommendation = recommendation
        self.needs_immediate_attention = needs_immediate_attention

    def get_result_display(self):
        return self.result.replace('_', ' ').title()

    def get_condition_display(self):
        return self.condition.title() if self.condition else ''


class _FakeResults:
    def __init__(self, rows):
        self._rows = rows

    def select_related(self, *args, **kwargs):
        return self

    def all(self):
        return self._rows


class _FakeInspection:
    def __init__(self, rows):
        self.results = _FakeResults(rows)


class IntakeConditionHelperTests(SimpleTestCase):
    def test_map_battery_choice(self):
        self.assertEqual(_map_battery_choice('Battery Condition: Good'), 'good')
        self.assertEqual(_map_battery_choice('Weak crank / low voltage'), 'weak')
        self.assertEqual(_map_battery_choice('Dead — needs jump'), 'dead')

    def test_extract_warning_lights_and_battery(self):
        inspection = _FakeInspection(
            [
                _FakeResult(
                    name='Dashboard Warning Lights',
                    result='advisory',
                    text_note='Check engine + ABS illuminated',
                ),
                _FakeResult(
                    name='Battery Condition',
                    result='pass',
                    rating_value=4,
                    condition='good',
                ),
                _FakeResult(
                    name='Headlights',
                    result='fail',
                    text_note='Left low beam out',
                ),
            ]
        )
        payload = extract_intake_from_inspection(inspection)
        self.assertIn('warning_lights_notes', payload)
        self.assertIn('Check engine', payload['warning_lights_notes'])
        self.assertEqual(payload.get('battery_condition'), 'good')
        self.assertNotIn('Headlights', payload.get('warning_lights_notes', ''))

    def test_format_result_skips_unchecked(self):
        result = _FakeResult(name='Battery', result='not_checked', text_note='')
        self.assertEqual(_format_result_text(result), '')
