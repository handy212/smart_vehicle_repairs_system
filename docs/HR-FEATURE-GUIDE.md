# HR Feature Guide

**Module:** Human Resources  
**Last updated:** June 2026  
**Related:** [HR Fix Backlog](./HR-FIX-BACKLOG.md)

This guide describes the HR module for implementers and power users: what each area does, who can access it, and the primary workflows.

---

## Module overview

The HR suite covers:

- **People** — staff profiles, departments, org chart, recruitment
- **Time** — leave, attendance, attendance policies
- **Pay** — payroll periods, payslips, statutory filing, salary components
- **Development** — performance reviews, training, compliance documents

All HR API routes require the `hr` module to be enabled and appropriate role permissions.

---

## Roles and permissions (key codes)

| Permission | Typical use |
|------------|-------------|
| `view_staff` | Browse staff list and profiles |
| `manage_staff` | Create/edit/delete staff |
| `view_leave` | Leave requests and balances (admin) |
| `manage_leave` | Configure leave types; manage balances |
| `approve_leave` | Approve/reject leave requests |
| `view_attendance` | Attendance records and policies |
| `manage_attendance` | Manual entries, policies |
| `view_payroll` | Payroll periods, register, statutory packs |
| `process_payroll` | Run payroll processing (generate payslips) |
| `manage_payroll` | Approve, mark paid, reverse, edit payslips |
| `view_recruitment` | Job openings and applicants |
| `manage_recruitment` | Publish jobs, hire, schedule interviews |

Employees without HR admin permissions can use **My HR** (`/hr/me`) for self-service when their user account is linked to an `EmployeeProfile`.

---

## Employee self-service (`/hr/me`)

Available to any authenticated user with an employee profile. No `view_hr` permission required.

| Feature | API |
|---------|-----|
| My profile | `GET /api/hr/staff/my_profile/` |
| Leave balances | `GET /api/hr/leave-balances/my_balances/` |
| Request / cancel leave | `POST /api/hr/leave-requests/`, `POST .../cancel/` |
| Clock in / out | `POST /api/hr/attendance/clock_in/`, `clock_out/` |
| My payslips + PDF | `GET /api/hr/payslips/my_payslips/`, `.../download_pdf/` |

---

## Payroll workflow

1. **Create period** — draft payroll period for a branch and date range (`manage_payroll`).
2. **Process** — generate payslips for active/probation employees (`process_payroll` or `manage_payroll`).
3. **Review register** — `/hr/payroll/{id}/register` for gross/tax/net totals.
4. **Approve** — lock payslips (`manage_payroll`; approver must differ from creator unless `manage_payroll`).
5. **Mark paid** — posts GL journal entry (`manage_payroll`).
6. **Statutory filing** — `/hr/payroll/statutory-filing` for PAYE/SSNIT packs on approved/paid periods.

Ghana statutory deductions (PAYE, SSNIT) are calculated in `PayrollService` via `StatutoryContributionService`. Salary components can carry a `statutory_code` for filing pack mapping.

---

## Leave workflow

1. Admin configures **leave types** (`/hr/leave/leave-types`, `manage_leave`).
2. Balances are tracked per employee per year.
3. Employees request leave via **My HR** or managers via Leave Management.
4. Approvers use `approve_leave` on pending requests.
5. Year-end carry-forward: `python manage.py carry_forward_leave_balances [--year YYYY]`.

---

## Attendance

- **Policies** (`/hr/attendance/policies`) define work hours, late thresholds, and overtime multipliers per branch.
- Staff clock in/out from My HR or the attendance page.
- Managers with `manage_attendance` can add manual records.

---

## Recruitment

- Job openings → applicants → interviews → hire creates `EmployeeProfile` + user account.
- Interview edit/delete is available on the applicant detail page (`manage_recruitment`).

---

## Compliance

- Compliance documents track licenses, certifications, and contracts with expiry dates.
- Scheduled reminders: `python manage.py send_compliance_expiry_reminders [--days-before 30]`.

---

## Scheduled jobs (recommended cron)

| Command | Suggested schedule |
|---------|-------------------|
| `carry_forward_leave_balances` | January 1 (or first working day) |
| `send_compliance_expiry_reminders` | Weekly |

---

## Navigation map

| Path | Purpose |
|------|---------|
| `/hr` | HR dashboard |
| `/hr/me` | Employee self-service |
| `/hr/staff` | Staff directory |
| `/hr/leave` | Leave management |
| `/hr/attendance` | Attendance records |
| `/hr/attendance/policies` | Attendance policy admin |
| `/hr/payroll` | Payroll periods |
| `/hr/payroll/[id]/register` | Payroll register |
| `/hr/payroll/statutory-filing` | Statutory filing pack |
| `/hr/payroll/my-payslips` | Employee payslip history |
