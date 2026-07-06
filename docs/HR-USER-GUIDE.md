# Human Resources — User Guide

**Product:** Smart Vehicle Repairs (SVR)  
**Audience:** HR managers, payroll officers, department heads, and all employees  
**Purpose:** Manage staff records, leave, attendance, payroll, and employee self-service  
**Last updated:** June 2026

---

## About this guide

This manual is for **people who use SVR’s HR features every day**. It explains where to click and how to complete common tasks. It does not cover technical setup, API details, or server configuration.

**You will learn:**

- How to find your way around the HR module  
- How employees use **My HR** for leave, attendance, and payslips  
- How managers maintain staff records, approve leave, and run payroll  
- How Ghana statutory deductions (PAYE, SSNIT) fit into payroll  
- How payroll connects to SVR accounting — and what does **not** go to QuickBooks  

**Related guides (optional reading):**

- [HR Feature Guide](./HR-FEATURE-GUIDE.md) — detailed reference for implementers and power users  
- [Accounting User Guide](./ACCOUNTING-USER-GUIDE.md) — general ledger and reports  
- [QuickBooks Online User Guide](./QUICKBOOKS-ONLINE-USER-GUIDE.md) — billing sync (separate from payroll)  

---

## 1. What the HR module covers

| Area | What you do here |
|------|------------------|
| **Staff** | Employee profiles, departments, org chart |
| **Leave** | Leave types, balances, requests, approvals |
| **Attendance** | Clock in/out, policies, attendance records |
| **Payroll** | Pay periods, payslips, approve and mark paid |
| **Statutory filing** | PAYE and SSNIT packs for approved payroll |
| **Recruitment** | Job openings, applicants, interviews, hiring |
| **Performance** | Review cycles and ratings |
| **Training** | Courses and employee training records |
| **Compliance** | Licenses, certifications, contracts with expiry dates |
| **My HR** | Employee self-service (leave, clock, payslips) |

**Important:** Payroll runs inside SVR. When payroll is **marked paid**, SVR posts the amounts to its **own general ledger accounts**. Payroll does **not** sync to QuickBooks Online. Workshop invoices and customer payments are a separate process (see the QuickBooks user guide).

---

## 2. Who uses which screens

| Role | Typical screens |
|------|-----------------|
| **Every employee** | **My HR** — profile, leave, clock in/out, payslips |
| **Line manager / supervisor** | **Leave Management** — approve or reject team leave |
| **HR officer** | **Staff**, **Leave**, **Attendance**, **Recruitment**, **Compliance** |
| **Payroll officer** | **Payroll**, **Salary components**, **Statutory filing** |
| **Finance manager** | Payroll approval, **Accounting → Controls** (payroll accounts) |

Your administrator controls who can open each screen under **Admin → Users**.

---

## 3. Navigation map

| Menu path | Purpose |
|-----------|---------|
| **HR** (dashboard) | Summary cards, quick links, pending leave and payroll alerts |
| **HR → My HR** | Employee self-service |
| **HR → Staff** | Staff directory and profiles |
| **HR → Staff → Org chart** | Reporting structure |
| **HR → Departments** | Departments and managers |
| **HR → Leave** | All leave requests (managers and HR) |
| **HR → Leave → Leave types** | Configure annual, sick, and other leave types |
| **HR → Attendance** | Attendance records |
| **HR → Attendance → Policies** | Work hours, lateness, overtime rules per branch |
| **HR → Payroll** | Payroll periods |
| **HR → Payroll → Components** | Salary elements (basic, allowances, deductions) |
| **HR → Payroll → Statutory filing** | PAYE / SSNIT export packs |
| **HR → Recruitment** | Vacancies and applicants |
| **HR → Performance** | Performance reviews |
| **HR → Training** | Training courses |
| **HR → Compliance** | Document expiry tracking |

---

## 4. My HR (employee self-service)

**Path:** **HR → My HR**

Available to any staff member whose user login is linked to an employee profile.

### 4.1 Your profile

The top of **My HR** shows your name, job title, department, and contact details. If the page says you have no employee profile, ask HR to link your user account to your staff record.

### 4.2 Leave

1. View your **leave balances** for the current year (annual, sick, etc.).  
2. Click **Request leave**, choose the leave type, start and end dates, and add a short reason.  
3. Submit — your request appears as **Pending** until a manager approves it.  
4. You can **cancel** a pending request before it is approved.  
5. Approved leave shows on your request history.

**Note:** Do not use old technician time-off screens if your site still shows them. All leave should go through **My HR** or **HR → Leave**.

### 4.3 Attendance

1. Click **Clock in** when you start your shift.  
2. Click **Clock out** when you finish.  
3. Your recent attendance appears in the list below.

Your branch’s **attendance policy** (under **HR → Attendance → Policies**) defines official start times, lateness rules, and overtime treatment.

### 4.4 Payslips

1. Scroll to **My payslips** on **My HR**, or open **HR → Payroll → My payslips**.  
2. Open a payslip to see gross pay, deductions, and net pay.  
3. Use **Download PDF** to save or print your slip.

Only **approved** or **paid** payroll periods appear for employees.

---

## 5. Staff records

**Path:** **HR → Staff**

### 5.1 Browse and search

The staff list shows active employees. Use search and filters to find someone by name, department, or status.

### 5.2 Add a new employee

1. Click **Add staff** (or **New**).  
2. Fill in personal details, job title, department, branch, employment dates, and salary basics.  
3. Link or create a **user account** so the person can log in and use **My HR**.  
4. Save.

### 5.3 Edit a profile

Open a staff member → **Edit**. Update contact details, job changes, bank information for payroll, emergency contacts, and documents as your policy requires.

### 5.4 Departments and org chart

- **HR → Departments** — create departments and assign a department head.  
- **HR → Staff → Org chart** — visual reporting lines. Useful for leave approvers and headcount reviews.

### 5.5 Compliance documents

**HR → Compliance** tracks items with expiry dates (licenses, medicals, contracts). HR receives reminders before documents expire so renewals are not missed.

---

## 6. Leave management

**Path:** **HR → Leave**

### 6.1 Configure leave types (HR admin)

**HR → Leave → Leave types**

Create types such as Annual, Sick, Compassionate, or Unpaid. For each type set:

- Whether it is paid or unpaid  
- Default days per year  
- Whether balance carries forward to the next year  

### 6.2 Approve or reject requests (managers)

1. Open **HR → Leave**.  
2. Filter by **Pending** if needed.  
3. Open a request, review dates and balance impact.  
4. Click **Approve** or **Reject** and add a comment if rejecting.

Employees see the outcome on **My HR**.

### 6.3 Apply leave on behalf of staff (HR)

HR users with leave access can create a request for an employee from the same **Leave** screen — useful when someone is unable to submit themselves.

### 6.4 Balances

Leave balances update when requests are approved. At year-end, HR runs carry-forward according to your leave-type rules (your administrator or HR lead handles the annual process).

---

## 7. Attendance

**Path:** **HR → Attendance**

### 7.1 View records

See who clocked in and out, hours worked, and late arrivals. Filter by date range and branch.

### 7.2 Attendance policies

**HR → Attendance → Policies**

For each branch define:

- Standard work start and end  
- Grace period for lateness  
- Overtime multiplier (used when calculating payroll overtime where applicable)

### 7.3 Manual corrections

Managers or HR with attendance access can add or adjust a record when someone forgot to clock in — document the reason in line with your internal policy.

---

## 8. Payroll

**Path:** **HR → Payroll**

Payroll is processed in **periods** (for example “June 2026 — Main branch”). Each period moves through clear stages: **Draft → Processed → Approved → Paid**.

### 8.1 Before you start

1. **Staff records** are up to date (active employees, correct salaries).  
2. **Salary components** are configured (**HR → Payroll → Components**).  
3. **Tax rules** are set on the payroll screen (PAYE bands, SSNIT rates) — open **Tax rules** from the payroll list.  
4. **Payroll GL accounts** are mapped under **Accounting → Controls & Compliance → GL control accounts → Payroll** group (finance manager). Defaults are salary expense (6000), overtime (6010), allowances (6020), employer statutory (6030), and payables (2300–2315). Change these only if your accountant uses different account numbers.

### 8.2 Salary components

**HR → Payroll → Components**

Define recurring pay elements:

| Type | Examples |
|------|----------|
| **Earnings** | Basic salary, housing allowance, transport |
| **Deductions** | Employee SSNIT, pension, loan repayments |
| **Employer contributions** | Employer SSNIT tier |

Assign components to employees on their staff profile or during payroll processing as your process requires.

### 8.3 Create a payroll period

1. **HR → Payroll** → **New payroll period**.  
2. Enter a name, branch, and pay period start/end dates.  
3. Save — status is **Draft**.

### 8.4 Process payroll (generate payslips)

1. Open the draft period.  
2. Click **Process** (or **Generate payslips**).  
3. SVR creates a payslip for each active employee in that branch.  
4. Review totals on the period summary.

Processing calculates:

- Basic pay and allowances  
- Overtime where applicable  
- Unpaid absence adjustments  
- **PAYE** income tax  
- **SSNIT** employee and employer portions  
- Net pay  

### 8.5 Review the register

**HR → Payroll** → open the period → **Register**

The register is a table of every employee’s gross, deductions, and net. Open an individual payslip to adjust lines if your role allows editing before approval.

### 8.6 Approve payroll

1. When totals are correct, click **Approve**.  
2. Payslips are locked for editing (except users with full payroll management access).  
3. The approver should be a different person from whoever processed the run, where your policy requires segregation of duties.

### 8.7 Mark paid

1. After bank transfers or cash payment to staff, click **Mark paid**.  
2. SVR records the payroll as **Paid** and creates a **journal entry** in SVR accounting:  
   - Debits: salary, overtime, allowances, employer statutory expense  
   - Credits: PAYE payable, payroll deductions payable, employer statutory payable, bank  

This posts to **SVR’s ledger only** — not to QuickBooks.

### 8.8 Reverse a paid period (if needed)

If a serious error was made on a paid run, a payroll manager can **reverse** the period. This voids the journal entry and returns the period to an earlier state. Use only with finance approval and follow your audit policy.

### 8.9 Employee payslip access

After approval, employees see payslips on **My HR** and can download PDF copies.

---

## 9. Statutory filing (Ghana)

**Path:** **HR → Payroll → Statutory filing**

After payroll is **approved** or **paid**:

1. Select the payroll period.  
2. Generate the **PAYE** and **SSNIT** filing packs.  
3. Download the reports or PDF statements your accountant needs for GRA and SSNIT submissions.  

SVR calculates statutory amounts from the same payslip data. Always reconcile filing totals with the payroll register before submitting to authorities.

---

## 10. Recruitment

**Path:** **HR → Recruitment**

### 10.1 Job openings

Create a vacancy with title, department, description, and closing date. Publish when ready.

### 10.2 Applicants

Applicants are added to each opening. Track status (applied, shortlisted, interviewed, offered, hired, rejected).

### 10.3 Interviews

Schedule interviews from the applicant detail page. Record notes and outcomes.

### 10.4 Hire

When you **Hire** an applicant, SVR can create a staff profile and user account, moving the person into **HR → Staff** for onboarding.

---

## 11. Performance and training

### 11.1 Performance reviews

**HR → Performance**

Create review cycles, assign reviewers, and record ratings and comments. Employees may view completed reviews according to your access settings.

### 11.2 Training

**HR → Training**

Maintain training courses and record which employees completed each course. Useful for compliance and skills tracking alongside **HR → Compliance**.

---

## 12. Payroll and accounting (plain language)

| Question | Answer |
|----------|--------|
| Where is salary expense recorded? | In **SVR Accounting** when payroll is marked **Paid** |
| Can I map which accounts are used? | Yes — **Accounting → Controls & Compliance → GL control accounts → Payroll** |
| Does payroll sync to QuickBooks? | **No.** QuickBooks receives customer invoices and vendor bills, not payroll |
| Who configures payroll accounts? | Finance manager, with your external accountant’s chart of accounts |
| What about income categories for billing? | Those are for **workshop invoices**, not HR — see the QuickBooks user guide |

---

## 13. Troubleshooting

### “No employee profile” on My HR

Your login is not linked to a staff record. Contact HR to create or link your profile.

### Leave request stuck on Pending

A manager with leave approval access must act on **HR → Leave**. Confirm the correct approver is assigned in your organisation.

### Payslip missing

The payroll period may still be **Draft** or **Processed** but not **Approved**. Only approved/paid periods show to employees.

### Wrong net pay after processing

1. Check the employee’s salary and assigned components on their staff profile.  
2. Open the payslip in the register and correct lines if still in draft/processed state.  
3. Verify **Tax rules** on the payroll screen match current GRA/SSNIT rates.

### Journal entry did not post when marking paid

Confirm the period status changed to **Paid**. If it failed, finance should check that payroll control accounts are mapped under **Accounting → Controls**. Unmapped accounts fall back to system defaults.

### Employee tried to use old time-off feature

Direct them to **My HR → Request leave**. Legacy time-off entry is no longer used for new requests.

---

## 14. Quick reference card

| Task | Where to go |
|------|-------------|
| Request leave | **HR → My HR** |
| Approve leave | **HR → Leave** |
| Clock in / out | **HR → My HR** |
| View my payslip | **HR → My HR** or **HR → Payroll → My payslips** |
| Run monthly payroll | **HR → Payroll** |
| Map payroll accounts | **Accounting → Controls & Compliance → Payroll** |
| PAYE / SSNIT packs | **HR → Payroll → Statutory filing** |
| Add new employee | **HR → Staff → Add staff** |
| Job vacancies | **HR → Recruitment** |

---

## 15. Support

1. Read this guide and **Help** in the SVR main menu.  
2. For payroll or leave policy questions, contact your HR lead or branch manager.  
3. For account mapping or journal entries, contact your finance manager.  
4. When reporting a problem, include branch name, employee name, payroll period name (if applicable), and a screenshot of the error.

---

*Smart Vehicle Repairs — Human Resources User Guide — For customer distribution. Print double-sided or export to PDF from your markdown viewer.*
