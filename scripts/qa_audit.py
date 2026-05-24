#!/usr/bin/env python3
"""
Automated QA / security probe for Smart Vehicle Repairs System.
Run against a live dev API (default http://127.0.0.1:8001/api).
"""
from __future__ import annotations

import json
import os
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

API_BASE = os.environ.get("QA_API_URL", "http://127.0.0.1:8001/api").rstrip("/")
REPORT_DIR = Path(os.environ.get("QA_REPORT_DIR", "/tmp/qa-audit"))
E2E_EMAIL = os.environ.get("E2E_EMAIL", "e2e_admin@example.com")
E2E_PASS = os.environ.get("E2E_PASSWORD", "e2e_test_pass_123")

# Sensitive endpoints: must reject unauthenticated access (401/403), never 200 with data leak
PROTECTED_GETS = [
    "/accounts/users/",
    "/accounts/admin/settings/",
    "/accounts/admin/audit-logs/",
    "/accounts/admin/backups/",
    "/accounts/admin/roles/",
    "/billing/invoices/",
    "/workorders/work-orders/",
    "/customers/customers/",
    "/inventory/parts/",
    "/accounting/journal-entries/",
    "/reporting/dashboard-overview/",
    "/hr/staff/",
    "/fixed-assets/assets/",
    "/notifications/templates/",
]

# Public or semi-public endpoints (200 without auth is acceptable)
PUBLIC_GETS = [
    "/accounts/admin/settings/public/branding/",
    "/accounts/admin/settings/public/integrations/",
    "/health/",
]

# Must not allow unauthenticated collection listing (PII enumeration)
FORBIDDEN_PUBLIC_LISTS = [
    "/workorders/public/",
]

# IDOR-style probes with bogus IDs
IDOR_GETS = [
    "/billing/invoices/999999/",
    "/workorders/work-orders/999999/",
    "/customers/customers/999999/",
]

# Abuse / validation probes
ABUSE_POSTS = [
    ("/auth/token/", {"email": "' OR 1=1--@x.com", "password": "x"}, "sql_injection_login"),
    ("/auth/token/", {"email": E2E_EMAIL, "password": ""}, "empty_password"),
    ("/accounts/register/initiate/", {"email": "not-an-email"}, "invalid_registration"),
]


@dataclass
class TestResult:
    test_id: str
    module: str
    name: str
    status: str  # PASS | FAIL | SKIP
    severity: str = ""
    detail: str = ""
    expected: str = ""
    actual: str = ""


@dataclass
class AuditReport:
    started_at: float = field(default_factory=time.time)
    results: list[TestResult] = field(default_factory=list)
    routes_discovered: list[str] = field(default_factory=list)

    def add(self, **kwargs: Any) -> None:
        self.results.append(TestResult(**kwargs))

    def passed(self) -> list[TestResult]:
        return [r for r in self.results if r.status == "PASS"]

    def failed(self) -> list[TestResult]:
        return [r for r in self.results if r.status == "FAIL"]


def http_request(
    method: str,
    path: str,
    *,
    token: str | None = None,
    body: dict | None = None,
    timeout: int = 15,
) -> tuple[int, Any]:
    url = f"{API_BASE}{path}" if path.startswith("/") else f"{API_BASE}/{path}"
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode()
    req = Request(url, data=data, headers=headers, method=method)
    try:
        with urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode(errors="replace")
            try:
                parsed = json.loads(raw) if raw else None
            except json.JSONDecodeError:
                parsed = raw[:500]
            return resp.status, parsed
    except HTTPError as e:
        raw = e.read().decode(errors="replace")
        try:
            parsed = json.loads(raw) if raw else None
        except json.JSONDecodeError:
            parsed = raw[:500]
        return e.code, parsed
    except URLError as e:
        return 0, str(e.reason)


def fetch_token(email: str, password: str) -> str | None:
    status, data = http_request("POST", "/auth/token/", body={"email": email, "password": password})
    if status == 200 and isinstance(data, dict):
        return data.get("access")
    return None


def discover_routes() -> list[str]:
    status, data = http_request("GET", "/")
    routes: list[str] = []

    def walk(obj: object) -> None:
        if isinstance(obj, str) and "/api/" in obj:
            routes.append(obj.split("/api", 1)[-1] or "/")
        elif isinstance(obj, dict):
            for val in obj.values():
                walk(val)

    if status == 200 and isinstance(data, dict):
        walk(data.get("endpoints", data))
    return sorted(set(routes))


def run_audit() -> AuditReport:
    report = AuditReport()
    REPORT_DIR.mkdir(parents=True, exist_ok=True)

    # Connectivity
    status, _ = http_request("GET", "/health/")
    if status == 200:
        report.add(
            test_id="QA-CONN-001",
            module="Infrastructure",
            name="API health check",
            status="PASS",
            detail=f"GET /health/ -> {status}",
        )
    else:
        report.add(
            test_id="QA-CONN-001",
            module="Infrastructure",
            name="API health check",
            status="FAIL",
            severity="Critical",
            detail=f"API unreachable or unhealthy: {status}",
            expected="HTTP 200",
            actual=str(status),
        )
        return report

    report.routes_discovered = discover_routes()
    report.add(
        test_id="QA-DISC-001",
        module="Discovery",
        name="API root route discovery",
        status="PASS" if report.routes_discovered else "FAIL",
        detail=f"Discovered {len(report.routes_discovered)} top-level API modules",
    )

    # Auth
    admin_token = fetch_token(E2E_EMAIL, E2E_PASS)
    if admin_token:
        report.add(
            test_id="QA-AUTH-001",
            module="Authentication",
            name="E2E admin JWT login",
            status="PASS",
        )
    else:
        report.add(
            test_id="QA-AUTH-001",
            module="Authentication",
            name="E2E admin JWT login",
            status="FAIL",
            severity="Critical",
            detail="Cannot obtain token; run create_e2e_user.py",
            expected="HTTP 200 + access token",
            actual="login failed",
        )

    bad_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid"
    for path in PROTECTED_GETS[:5]:
        status, data = http_request("GET", path, token=bad_token)
        ok = status in (401, 403)
        report.add(
            test_id=f"QA-AUTH-002-{path.strip('/').replace('/', '-')}",
            module="Authentication",
            name=f"Invalid JWT rejected: {path}",
            status="PASS" if ok else "FAIL",
            severity="High" if not ok else "",
            expected="401 or 403",
            actual=f"{status}",
            detail=str(data)[:200] if not ok and status == 200 else "",
        )

    # Unauthenticated access to protected resources
    for path in PROTECTED_GETS:
        status, data = http_request("GET", path)
        leak = status == 200 and isinstance(data, dict) and (
            data.get("results") or data.get("count", 0) > 0 or isinstance(data, list) and len(data) > 0
        )
        report.add(
            test_id=f"QA-RBAC-UNAUTH-{path.strip('/').replace('/', '-')}",
            module="RBAC",
            name=f"Unauthenticated blocked: {path}",
            status="FAIL" if leak else ("PASS" if status in (401, 403) else "FAIL"),
            severity="Critical" if leak else ("Medium" if status not in (401, 403) else ""),
            expected="401 or 403, no data",
            actual=f"HTTP {status}",
            detail="Possible data leak" if leak else "",
        )

    for path in FORBIDDEN_PUBLIC_LISTS:
        status, data = http_request("GET", path)
        report.add(
            test_id=f"QA-SEC-PUBLIC-LIST-{path.strip('/').replace('/', '-')}",
            module="Security",
            name=f"Public list blocked: {path}",
            status="PASS" if status in (404, 405) else "FAIL",
            severity="Critical" if status == 200 else "",
            expected="404 or 405 (no enumerable list)",
            actual=f"HTTP {status}",
            detail=str(data)[:200] if status == 200 else "",
        )

    # Public endpoints
    for path in PUBLIC_GETS:
        status, _ = http_request("GET", path)
        report.add(
            test_id=f"QA-PUB-{path.strip('/').replace('/', '-')}",
            module="Public API",
            name=f"Public endpoint accessible: {path}",
            status="PASS" if status == 200 else "FAIL",
            severity="Low" if status != 200 else "",
            expected="HTTP 200",
            actual=f"HTTP {status}",
        )

    # IDOR with admin token (should be 404/403, not 500)
    if admin_token:
        for path in IDOR_GETS:
            status, data = http_request("GET", path, token=admin_token)
            ok = status in (403, 404)
            report.add(
                test_id=f"QA-IDOR-{path.strip('/').replace('/', '-')}",
                module="Authorization",
                name=f"Non-existent resource: {path}",
                status="PASS" if ok else "FAIL",
                severity="Medium" if not ok else "",
                expected="403 or 404",
                actual=f"HTTP {status}",
                detail=str(data)[:150] if status >= 500 else "",
            )

        # Settings secret exposure
        status, data = http_request("GET", "/accounts/admin/settings/", token=admin_token)
        if status == 200 and isinstance(data, list):
            exposed = [
                s for s in data
                if isinstance(s, dict)
                and s.get("is_secret")
                and s.get("value") not in (None, "", "********")
            ]
            report.add(
                test_id="QA-SEC-001",
                module="Security",
                name="Secret settings masked in API",
                status="FAIL" if exposed else "PASS",
                severity="Critical" if exposed else "",
                expected="Secrets redacted or omitted",
                actual=f"{len(exposed)} secrets with raw values" if exposed else "masked",
                detail=", ".join(s.get("key", "?") for s in exposed[:5]),
            )

    # Abuse scenarios
    for path, body, label in ABUSE_POSTS:
        status, data = http_request("POST", path, body=body)
        ok = status in (400, 401, 403, 404, 429)
        report.add(
            test_id=f"QA-ABUSE-{label}",
            module="Input validation",
            name=f"Abuse probe: {label}",
            status="PASS" if ok else "FAIL",
            severity="High" if status == 200 else "Low",
            expected="4xx rejection",
            actual=f"HTTP {status}",
        )

    # Rate-limit / timing smoke (login burst)
    t0 = time.time()
    codes = []
    for _ in range(5):
        s, _ = http_request("POST", "/auth/token/", body={"username": "nobody", "password": "wrong"})
        codes.append(s)
    elapsed = time.time() - t0
    report.add(
        test_id="QA-PERF-001",
        module="Performance",
        name="Auth endpoint burst (5 failed logins)",
        status="PASS",
        detail=f"codes={codes}, elapsed={elapsed:.2f}s",
    )

    return report


def write_report(report: AuditReport) -> Path:
    out = REPORT_DIR / "qa_api_audit.json"
    payload = {
        "api_base": API_BASE,
        "routes_discovered": report.routes_discovered,
        "summary": {
            "total": len(report.results),
            "passed": len(report.passed()),
            "failed": len(report.failed()),
        },
        "results": [
            {
                "test_id": r.test_id,
                "module": r.module,
                "name": r.name,
                "status": r.status,
                "severity": r.severity,
                "detail": r.detail,
                "expected": r.expected,
                "actual": r.actual,
            }
            for r in report.results
        ],
    }
    out.write_text(json.dumps(payload, indent=2))
    return out


def main() -> int:
    report = run_audit()
    path = write_report(report)
    failed = report.failed()
    print(f"QA API Audit: {len(report.passed())} passed, {len(failed)} failed")
    print(f"Report: {path}")
    for r in failed:
        print(f"  FAIL [{r.severity or 'n/a'}] {r.test_id}: {r.name} — {r.actual}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
