import pytest

from apps.mobile_views import _search_result_url


@pytest.mark.parametrize(
    ('result_type', 'expected'),
    [
        ('workorder', '/portal/work-orders/17'),
        ('customer', '/portal/profile'),
        ('vehicle', '/portal/vehicles/17'),
        ('appointment', '/portal/appointments/17'),
        ('invoice', '/portal/invoices/17'),
    ],
)
def test_customer_search_results_use_portal_routes(result_type, expected):
    assert _search_result_url(result_type, 17, is_customer=True) == expected


def test_customer_search_has_no_route_for_staff_only_parts():
    assert _search_result_url('part', 17, is_customer=True) is None


@pytest.mark.parametrize(
    ('result_type', 'expected'),
    [
        ('workorder', '/workorders/17/'),
        ('customer', '/customers/17/'),
        ('vehicle', '/vehicles/17/'),
        ('appointment', '/appointments/17/'),
        ('invoice', '/billing/invoices/17/'),
        ('part', '/inventory/17/'),
    ],
)
def test_staff_search_routes_are_preserved(result_type, expected):
    assert _search_result_url(result_type, 17) == expected
