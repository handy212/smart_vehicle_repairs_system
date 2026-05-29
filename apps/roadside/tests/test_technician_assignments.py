"""Technician mobile scoping for roadside assignments."""
from datetime import timedelta

import pytest
from django.utils import timezone
from model_bakery import baker
from rest_framework.test import APIClient

from apps.branches.models import Branch
from apps.roadside.models import RoadsideDispatch, RoadsideRequest


def _make_roadside(*, assigned_technician, branch, status="dispatched", response_status="accepted"):
    req = baker.make(
        RoadsideRequest,
        customer=baker.make("customers.Customer"),
        vehicle=baker.make("vehicles.Vehicle"),
        branch=branch,
        assigned_technician=assigned_technician,
        status=status,
        service_type="battery_boost",
        breakdown_location="123 Test Rd",
    )
    if assigned_technician:
        baker.make(
            RoadsideDispatch,
            request=req,
            technician=assigned_technician,
            response_status=response_status,
        )
    return req


@pytest.fixture
def branch(db):
    return baker.make(Branch, name="Test Branch", is_active=True)


@pytest.fixture
def other_technician_user(db):
    from django.contrib.auth import get_user_model

    User = get_user_model()
    return baker.make(User, role="technician", is_active=True)


@pytest.mark.django_db
class TestTechnicianRoadsideAssignments:
    def test_my_assignments_only_returns_assigned_jobs(
        self, technician_user, other_technician_user, branch
    ):
        mine = _make_roadside(assigned_technician=technician_user, branch=branch)
        _make_roadside(assigned_technician=other_technician_user, branch=branch)

        client = APIClient()
        client.force_authenticate(user=technician_user)
        response = client.get(
            "/api/roadside/requests/my-assignments/",
            HTTP_X_TECH_APP="1",
        )

        assert response.status_code == 200
        ids = {item["id"] for item in response.data}
        assert mine.id in ids
        assert len(ids) == 1

    def test_tech_app_header_scopes_list_for_manager(self, manager_user, technician_user, branch):
        """Managers on /mobile should not see entire branch via X-Tech-App."""
        _make_roadside(assigned_technician=technician_user, branch=branch)
        _make_roadside(assigned_technician=None, branch=branch, status="requested")

        client = APIClient()
        client.force_authenticate(user=manager_user)
        response = client.get("/api/roadside/requests/", HTTP_X_TECH_APP="1")

        assert response.status_code == 200
        data = response.data.get("results", response.data)
        assert len(data) == 0

    def test_old_completed_hidden_without_history(self, technician_user, branch):
        old = _make_roadside(
            assigned_technician=technician_user,
            branch=branch,
            status="completed",
        )
        RoadsideRequest.objects.filter(pk=old.pk).update(
            completed_at=timezone.now() - timedelta(days=30),
            updated_at=timezone.now() - timedelta(days=30),
        )

        client = APIClient()
        client.force_authenticate(user=technician_user)
        response = client.get("/api/roadside/requests/my-assignments/")

        ids = {item["id"] for item in response.data}
        assert old.id not in ids

    def test_accept_then_en_route(self, technician_user, branch):
        job = _make_roadside(
            assigned_technician=technician_user,
            branch=branch,
            response_status="pending",
        )

        client = APIClient()
        client.force_authenticate(user=technician_user)

        accept = client.post(f"/api/roadside/requests/{job.id}/accept-assignment/")
        assert accept.status_code == 200
        assert accept.data["my_assignment_status"] == "accepted"

        en_route = client.post(f"/api/roadside/requests/{job.id}/en_route/")
        assert en_route.status_code == 200
        assert en_route.data["status"] == "en_route"

    def test_en_route_blocked_until_accepted(self, technician_user, branch):
        job = _make_roadside(
            assigned_technician=technician_user,
            branch=branch,
            response_status="pending",
        )

        client = APIClient()
        client.force_authenticate(user=technician_user)
        response = client.post(f"/api/roadside/requests/{job.id}/en_route/")
        assert response.status_code == 400

    def test_reject_returns_to_requested(self, technician_user, branch):
        job = _make_roadside(
            assigned_technician=technician_user,
            branch=branch,
            response_status="pending",
        )

        client = APIClient()
        client.force_authenticate(user=technician_user)
        response = client.post(
            f"/api/roadside/requests/{job.id}/reject-assignment/",
            {"reason": "Too far"},
            format="json",
        )
        assert response.status_code == 200
        job.refresh_from_db()
        assert job.status == "requested"
        assert job.assigned_technician_id is None
