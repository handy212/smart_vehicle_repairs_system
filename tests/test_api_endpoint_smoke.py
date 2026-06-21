"""Smoke-test API list/detail routes — no 5xx responses for authenticated admin."""
from __future__ import annotations

import re

import pytest
from django.urls import URLPattern, URLResolver, get_resolver
from rest_framework.test import APIClient

from apps.accounts.admin_models import SystemModule
from apps.accounts.models import User
from apps.branches.models import Branch

SKIP_PATH = re.compile(
    r'<|\{|schema|docs|redoc|callback|oauth|webhook|token|login|logout|register|'
    r'password|paystack|stripe|health/live|health/ready|sync-outbound|connect|'
    r'pull-|full-sync|disconnect|refresh-token|attachment|export|print|pdf|'
    r'upload|download|bulk|import|preview|send_|mark_|approve|void|cancel|duplicate|'
    r'apply|allocate|receive|convert|generate|run_|execute|trigger|webhook',
    re.I,
)


def _collect_api_routes(resolver, prefix=''):
    routes = []
    for pattern in resolver.url_patterns:
        if isinstance(pattern, URLPattern):
            route = prefix + str(pattern.pattern)
            if route.startswith('api/'):
                routes.append('/' + route.lstrip('/'))
        elif isinstance(pattern, URLResolver):
            routes.extend(_collect_api_routes(pattern, prefix + str(pattern.pattern)))
    return routes


def _normalize_route(path: str) -> str:
    cleaned = path.replace('^', '').replace('$', '')
    if not cleaned.startswith('/'):
        cleaned = '/' + cleaned
    if not cleaned.endswith('/'):
        cleaned += '/'
    return cleaned


LIST_ROOT_RE = re.compile(r'^/api/[^/]+/[^/]+/$')


def _is_smoke_candidate(path: str) -> bool:
    path = _normalize_route(path)
    if SKIP_PATH.search(path):
        return False
    return bool(LIST_ROOT_RE.match(path))


@pytest.fixture
def smoke_admin(db):
    user = User.objects.create_superuser(
        username='api_smoke_admin',
        email='api-smoke@test.com',
        password='password',
        role='admin',
    )
    branch = Branch.objects.create(
        name='Smoke Branch',
        code='SMK',
        phone='0000000000',
        address='1 Test St',
        city='Accra',
        state='Greater Accra',
        zip_code='00000',
        created_by=user,
    )
    user.branch = branch
    user.save(update_fields=['branch'])

    for slug in (
        'billing', 'inventory', 'workorders', 'customers', 'vehicles', 'appointments',
        'accounting', 'reporting', 'notifications', 'inspections', 'diagnosis',
        'gatepass', 'documents', 'subscriptions', 'roadside', 'fixed_assets',
        'technicians', 'hr', 'feedback', 'chat', 'branches', 'quickbooks', 'portal',
    ):
        SystemModule.objects.update_or_create(
            slug=slug,
            defaults={'name': slug.replace('_', ' ').title(), 'is_enabled': True},
        )
    return user


@pytest.mark.django_db
def test_public_health_endpoints():
    client = APIClient()
    for path in ('/api/health/', '/api/health/live/', '/api/health/ready/', '/api/'):
        response = client.get(path)
        assert response.status_code == 200, f'{path} returned {response.status_code}'


@pytest.mark.django_db
def test_api_list_routes_do_not_server_error(smoke_admin):
    client = APIClient()
    client.force_authenticate(user=smoke_admin)

    all_routes = [_normalize_route(r) for r in _collect_api_routes(get_resolver())]
    candidates = sorted({r for r in all_routes if _is_smoke_candidate(r)})

    server_errors = []
    unexpected = []

    for path in candidates:
        response = client.get(path)
        if response.status_code >= 500:
            server_errors.append((path, response.status_code, response.content[:200]))
        elif response.status_code not in (200, 201, 204, 301, 302, 401, 403, 404, 405):
            unexpected.append((path, response.status_code))

    assert not server_errors, (
        'API routes returned 5xx:\n'
        + '\n'.join(f'  {p} -> {c}: {body!r}' for p, c, body in server_errors)
    )

    # Smoke test: only fail on server errors; 400/404 on list roots are acceptable without query params.
    bad_client_errors = [(p, c) for p, c in unexpected if c >= 400 and c not in (400, 404, 405)]
    assert not bad_client_errors, (
        'API routes returned unexpected client errors:\n'
        + '\n'.join(f'  {p} -> {c}' for p, c in bad_client_errors)
    )
