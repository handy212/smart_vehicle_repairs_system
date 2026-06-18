# HR Suite — Prioritized Fix Backlog

**Module:** Human Resources  
**Audience:** Product, engineering, implementation  
**Last updated:** June 2026  
**Related:** [HR Feature Guide](./HR-FEATURE-GUIDE.md)

---

## How to use this backlog

| Priority | Meaning |
|----------|---------|
| **P0** | Trust breaker — broken permissions, blocked workflows |
| **P1** | Professional polish — self-service, missing admin UIs |
| **P2** | Completeness — scheduled jobs, tests, docs |

**Status key:** `Open` · `In progress` · `Done`

---

## P0 — Must fix before go-live

### HR-P0-01 · Fix `my_payslips` permission exempt list

| Field | Detail |
|-------|--------|
| **User impact** | Employees could not access their own payslips without `view_payroll` |
| **Fix** | Exempt `my_payslips` (not `my_slips`) in `PaySlipViewSet.get_permissions` |
| **Status** | Done |

### HR-P0-02 · Fix `my_balances` permission

| Field | Detail |
|-------|--------|
| **User impact** | Employees needed `manage_leave` to view their own leave balances |
| **Fix** | Exempt `my_balances` from `manage_leave` in `LeaveBalanceViewSet` |
| **Status** | Done |

### HR-P0-03 · Align `process_payroll` with backend

| Field | Detail |
|-------|--------|
| **User impact** | Users with `process_payroll` but not `manage_payroll` could not run payroll |
| **Fix** | Allow `process` action with `process_payroll` OR `manage_payroll` |
| **Status** | Done |

### HR-P0-04 · Align Staff nav permission with pages

| Field | Detail |
|-------|--------|
| **User impact** | Nav showed Staff for `view_employees` but pages required `view_staff` |
| **Fix** | Use `view_staff` in `sub-nav-groups.ts` and dashboard requirements |
| **Status** | Done |

### HR-P0-05 · Add page guards to staff CRUD routes

| Field | Detail |
|-------|--------|
| **Affected paths** | `/hr/staff/new`, `/hr/staff/[id]`, `/hr/staff/[id]/edit` |
| **Fix** | `manage_staff` / `view_staff` `PermissionPageGuard` wrappers |
| **Status** | Done |

### HR-P0-06 · Fix leave types page permissions

| Field | Detail |
|-------|--------|
| **User impact** | Page used `view_hr`; CRUD buttons lacked `manage_leave` guard |
| **Fix** | `view_leave` page guard; CRUD behind `manage_leave` |
| **Status** | Done |

---

## P1 — Next release polish

### HR-P1-01 · Employee self-service hub (`/hr/me`)

| Field | Detail |
|-------|--------|
| **Scope** | Profile, leave balances, request/cancel leave, attendance clock, payslip PDF |
| **Status** | Done |

### HR-P1-02 · Payroll register UI

| Field | Detail |
|-------|--------|
| **Path** | `/hr/payroll/[id]/register` |
| **Status** | Done |

### HR-P1-03 · Attendance policies admin UI

| Field | Detail |
|-------|--------|
| **Path** | `/hr/attendance/policies` |
| **Status** | Done |

### HR-P1-04 · My payslips JSX fix + PDF download

| Field | Detail |
|-------|--------|
| **Fix** | Remove visible `// Earnings` / `// Deductions` text; add PDF download |
| **Status** | Done |

### HR-P1-05 · Statutory filing page guard + header

| Field | Detail |
|-------|--------|
| **Path** | `/hr/payroll/statutory-filing` |
| **Status** | Done |

### HR-P1-06 · Serializer fields for statutory reporting

| Field | Detail |
|-------|--------|
| **Fix** | Expose `statutory_code` on salary components; `employer_contributions` on payslips |
| **Status** | Done |

### HR-P1-07 · Interview edit/delete on applicant page

| Field | Detail |
|-------|--------|
| **Status** | Done |

### HR-P1-08 · Expand payroll employee scope

| Field | Detail |
|-------|--------|
| **Fix** | Include employees via `department__branch` as well as `user__branch` |
| **Status** | Done |

---

## P2 — Completeness

### HR-P2-01 · Leave carry-forward management command

| Field | Detail |
|-------|--------|
| **Command** | `python manage.py carry_forward_leave_balances` |
| **Status** | Done |

### HR-P2-02 · Compliance expiry reminder command

| Field | Detail |
|-------|--------|
| **Command** | `python manage.py send_compliance_expiry_reminders` |
| **Status** | Done |

### HR-P2-03 · Permission and self-service tests

| Field | Detail |
|-------|--------|
| **Coverage** | `my_payslips`, `my_balances`, `process_payroll` |
| **Status** | Done |

### HR-P2-04 · HR documentation

| Field | Detail |
|-------|--------|
| **Files** | `docs/HR-FIX-BACKLOG.md`, `docs/HR-FEATURE-GUIDE.md` |
| **Status** | Done |
