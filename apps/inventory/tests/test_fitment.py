"""Unit tests for soft vehicle–part fitment matching."""
from django.test import SimpleTestCase

from apps.inventory.fitment import match_part_to_vehicle, fitment_rank


class FitmentMatchTests(SimpleTestCase):
    def test_empty_fitment_is_unknown(self):
        self.assertEqual(
            match_part_to_vehicle(make="Toyota", model="Camry", year=2020),
            "unknown",
        )

    def test_likely_make_model_year(self):
        self.assertEqual(
            match_part_to_vehicle(
                compatible_makes="Toyota, Honda",
                compatible_models="Camry, Accord",
                compatible_years="2015-2023",
                make="Toyota",
                model="Camry",
                year=2020,
            ),
            "likely",
        )

    def test_unlikely_wrong_make(self):
        self.assertEqual(
            match_part_to_vehicle(
                compatible_makes="Honda",
                compatible_models="Accord",
                compatible_years="2015-2023",
                make="Toyota",
                model="Camry",
                year=2020,
            ),
            "unlikely",
        )

    def test_unlikely_year_out_of_range(self):
        self.assertEqual(
            match_part_to_vehicle(
                compatible_makes="Toyota",
                compatible_models="Camry",
                compatible_years="2010-2015",
                make="Toyota",
                model="Camry",
                year=2020,
            ),
            "unlikely",
        )

    def test_universal_marker_is_likely(self):
        self.assertEqual(
            match_part_to_vehicle(
                compatible_makes="universal",
                make="Toyota",
                year=2020,
            ),
            "likely",
        )

    def test_no_vehicle_context_unknown(self):
        self.assertEqual(
            match_part_to_vehicle(
                compatible_makes="Toyota",
                compatible_models="Camry",
            ),
            "unknown",
        )

    def test_fitment_rank_order(self):
        self.assertLess(fitment_rank("likely"), fitment_rank("unknown"))
        self.assertLess(fitment_rank("unknown"), fitment_rank("unlikely"))
