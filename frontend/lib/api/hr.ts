import apiClient from "./client";

// =============================================================================
// Types
// =============================================================================

export interface Department {
    id: number;
    name: string;
    description: string;
    branch: number;
    branch_name: string;
    head: number | null;
    head_name: string | null;
    is_active: boolean;
    staff_count: number;
    created_at: string;
    updated_at: string;
}

export interface Position {
    id: number;
    title: string;
    department: number;
    department_name: string;
    description: string;
    min_salary: string | null;
    max_salary: string | null;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export interface StaffProfile {
    id: number;
    user: number;
    user_details?: {
        id: number;
        email: string;
        first_name: string;
        last_name: string;
        full_name?: string;
        phone?: string;
        profile_picture?: string;
        role?: string;
        branch?: number;
        employee_id?: string;
        address?: string;
        city?: string;
        state?: string;
        zip_code?: string;
        country?: string;
    };
    full_name: string;
    department: number | null;
    department_name: string | null;
    position: number | null;
    position_title: string | null;
    branch_name: string | null;
    employment_type: "full_time" | "part_time" | "contract" | "intern";
    employment_status: "active" | "probation" | "suspended" | "terminated" | "resigned";
    is_active_staff: boolean;
    start_date: string | null;
    end_date: string | null;
    reporting_to: number | null;
    reporting_to_name: string | null;
    salary_type: "hourly" | "monthly" | "annual";
    base_salary: string;
    bank_name: string;
    bank_account_number: string;
    bank_branch: string;
    emergency_contact_name: string;
    emergency_contact_phone: string;
    emergency_contact_relationship: string;
    national_id: string;
    tax_id: string;
    notes: string;
    profile_picture?: string | null;
    branch?: number | null;
    technician_id?: number | null;
    created_at: string;
    updated_at: string;
}

export interface StaffListItem {
    id: number;
    user: number;
    full_name: string;
    email: string;
    phone: string;
    profile_picture: string | null;
    department_name: string | null;
    position_title: string | null;
    branch_name: string | null;
    employment_type: string;
    employment_status: string;
    start_date: string | null;
    technician_id?: number | null;
}

export interface LeaveType {
    id: number;
    name: string;
    description: string;
    days_allowed: number;
    is_paid: boolean;
    carry_forward: boolean;
    max_carry_forward: number;
    requires_document: boolean;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export interface LeaveBalance {
    id: number;
    staff: number;
    staff_name: string;
    leave_type: number;
    leave_type_name: string;
    year: number;
    total_days: number;
    used_days: number;
    carried_forward: number;
    remaining_days: number;
    utilization_percentage: number;
}

export interface LeaveRequest {
    id: number;
    staff: number;
    staff_name: string;
    leave_type: number;
    leave_type_name: string;
    start_date: string;
    end_date: string;
    days_count: number;
    reason: string;
    status: "pending" | "approved" | "rejected" | "cancelled";
    status_display: string;
    reviewed_by: number | null;
    reviewed_by_name: string | null;
    reviewed_at: string | null;
    reviewer_notes: string;
    document: string | null;
    created_at: string;
    updated_at: string;
}

export interface AttendancePolicy {
    id: number;
    name: string;
    work_start_time: string;
    work_end_time: string;
    late_threshold_minutes: number;
    half_day_hours: number;
    overtime_multiplier: number;
    branch: number;
    branch_name: string;
    is_default: boolean;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export interface AttendanceRecord {
    id: number;
    staff: number;
    staff_name: string;
    date: string;
    clock_in: string | null;
    clock_out: string | null;
    break_start: string | null;
    break_end: string | null;
    total_hours: number | string | null;
    overtime_hours: number | string;
    status: "present" | "absent" | "late" | "half_day" | "on_leave";
    status_display: string;
    notes: string;
    branch: number;
    branch_name: string;
    created_at: string;
    updated_at: string;
}

export interface PayrollPeriod {
    id: number;
    name: string;
    start_date: string;
    end_date: string;
    status: "draft" | "processing" | "approved" | "paid" | "reversed";
    branch: number;
    branch_name: string;
    created_by: number | null;
    created_by_name: string | null;
    approved_by: number | null;
    approved_at: string | null;
    paid_by: number | null;
    paid_at: string | null;
    payment_batch_reference: string;
    reversed_by: number | null;
    reversed_at: string | null;
    reversal_reason: string;
    notes: string;
    total_payslips: number;
    total_net_pay: string;
    journal_entry_id: number | null;
    created_at: string;
    updated_at: string;
}

export interface PaySlip {
    id: number;
    payslip_number: string | null;
    payroll_period: number;
    period_name: string;
    staff: number;
    staff_name: string;
    basic_salary: string;
    overtime_pay: string;
    unpaid_leave_deduction: string;
    absence_deduction: string;
    proration_factor: string;
    allowances: Record<string, string>;
    deductions: Record<string, string>;
    gross_pay: string;
    tax_amount: string;
    net_pay: string;
    status: "draft" | "approved" | "paid" | "reversed";
    payment_date: string | null;
    payment_reference: string;
    is_locked: boolean;
    created_at: string;
    updated_at: string;
}

export interface SalaryComponent {
    id: number;
    name: string;
    component_type: "allowance" | "deduction";
    calculation_type: "fixed" | "percentage";
    amount: string;
    percentage: string;
    is_taxable: boolean;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export interface EmployeeSalaryComponent {
    id: number;
    employee: number;
    employee_name: string;
    component: number;
    component_name: string;
    component_type: string;
    amount: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export interface TaxRule {
    id: number;
    name: string;
    min_income: string | null;
    max_income: string | null;
    rate: string;
    excess_amount: string;
}

export type EmployeeProfile = StaffProfile;

export interface PayrollAuditLog {
    id: number;
    action: string;
    employee: number | null;
    employee_name: string | null;
    payroll_period: number | null;
    payslip: number | null;
    performed_by: number | null;
    performed_by_name: string | null;
    changes: Record<string, unknown>;
    created_at: string;
}

export interface JobOpening {
    id: number;
    title: string;
    department: number;
    department_name: string;
    position: number | null;
    description: string;
    requirements: string;
    employment_type: string;
    salary_range_min: string | null;
    salary_range_max: string | null;
    status: "draft" | "open" | "on_hold" | "closed";
    branch: number;
    branch_name: string;
    posted_date: string | null;
    closing_date: string | null;
    vacancies: number;
    applicant_count: number;
    created_by: number | null;
    created_by_name: string | null;
    created_at: string;
    updated_at: string;
}

export interface Applicant {
    id: number;
    job_opening: number;
    job_title: string;
    first_name: string;
    last_name: string;
    full_name: string;
    email: string;
    phone: string;
    resume: string | null;
    cover_letter: string;
    status: "new" | "screening" | "interview" | "offered" | "hired" | "rejected";
    source: string;
    applied_date: string;
    notes: string;
    interviews: Interview[];
    created_at: string;
    updated_at: string;
}

export interface Interview {
    id: number;
    applicant: number;
    applicant_name: string;
    interviewer: number | null;
    interviewer_name: string | null;
    scheduled_at: string;
    duration_minutes: number;
    interview_type: "phone" | "in_person" | "video" | "technical";
    status: "scheduled" | "completed" | "cancelled" | "no_show";
    location: string;
    meeting_link: string;
    feedback: string;
    rating: number | null;
    created_at: string;
    updated_at: string;
}

export interface PerformanceReview {
    id: number;
    staff: number;
    staff_name: string;
    reviewer: number | null;
    reviewer_name: string | null;
    review_period_start: string;
    review_period_end: string;
    overall_rating: number | null;
    strengths: string;
    areas_for_improvement: string;
    goals: string;
    staff_comments: string;
    status: "draft" | "submitted" | "acknowledged";
    submitted_at: string | null;
    acknowledged_at: string | null;
    created_at: string;
    updated_at: string;
}

export interface TrainingProgram {
    id: number;
    name: string;
    description: string;
    trainer: string;
    start_date: string | null;
    end_date: string | null;
    max_participants: number | null;
    is_mandatory: boolean;
    department: number | null;
    department_name: string | null;
    is_active: boolean;
    enrolled_count: number;
    created_at: string;
    updated_at: string;
}

export interface StaffTraining {
    id: number;
    staff: number;
    staff_name: string;
    training: number;
    training_name: string;
    status: "enrolled" | "in_progress" | "completed" | "failed" | "withdrawn";
    enrolled_date: string;
    completion_date: string | null;
    certificate: string | null;
    score: number | null;
    notes: string;
    created_at: string;
    updated_at: string;
}

export interface ComplianceDocument {
    id: number;
    staff: number;
    staff_name: string;
    document_type: string;
    name: string;
    document_number: string;
    document_file: string | null;
    issue_date: string | null;
    expiry_date: string | null;
    status: "valid" | "expiring_soon" | "expired";
    reminder_sent: boolean;
    notes: string;
    is_expiring_soon: boolean;
    days_until_expiry: number | null;
    is_expired: boolean;
    created_at: string;
    updated_at: string;
}

export interface PaginatedResponse<T> {
    count: number;
    next: string | null;
    previous: string | null;
    results: T[];
}

export interface AttendanceSummary {
    date: string;
    total: number;
    present: number;
    late: number;
    absent: number;
    on_leave: number;
    attendance_rate: number;
}

export interface StaffSummary {
    total_staff: number;
    active: number;
    probation: number;
    terminated: number;
    resigned: number;
    by_department: { department__name: string; count: number }[];
}

// =============================================================================
// API Client
// =============================================================================

const BASE = "/hr";

export const hrApi = {
    // ------- Departments -------
    departments: {
        list: (params?: { branch?: number; is_active?: boolean; search?: string }) =>
            apiClient.get<PaginatedResponse<Department>>(`${BASE}/departments/`, { params }),
        get: (id: number) =>
            apiClient.get<Department>(`${BASE}/departments/${id}/`),
        create: (data: Partial<Department>) =>
            apiClient.post<Department>(`${BASE}/departments/`, data),
        update: (id: number, data: Partial<Department>) =>
            apiClient.patch<Department>(`${BASE}/departments/${id}/`, data),
        delete: (id: number) =>
            apiClient.delete(`${BASE}/departments/${id}/`),
    },

    // ------- Positions -------
    positions: {
        list: (params?: { department?: number; is_active?: boolean; search?: string }) =>
            apiClient.get<PaginatedResponse<Position>>(`${BASE}/positions/`, { params }),
        get: (id: number) =>
            apiClient.get<Position>(`${BASE}/positions/${id}/`),
        create: (data: Partial<Position>) =>
            apiClient.post<Position>(`${BASE}/positions/`, data),
        update: (id: number, data: Partial<Position>) =>
            apiClient.patch<Position>(`${BASE}/positions/${id}/`, data),
        delete: (id: number) =>
            apiClient.delete(`${BASE}/positions/${id}/`),
    },

    // ------- Staffs -------
    staff: {
        list: (params?: {
            page?: number;
            search?: string;
            department?: number;
            employment_status?: string;
            employment_type?: string;
        }) =>
            apiClient.get<PaginatedResponse<StaffListItem>>(`${BASE}/staff/`, { params }),
        get: (id: number) =>
            apiClient.get<StaffProfile>(`${BASE}/staff/${id}/`),
        create: (data: FormData | (Partial<StaffProfile> & {
            email: string;
            first_name: string;
            last_name: string;
            password: string;
            phone?: string;
            role?: string;
        })) => {
            const isFormData = data instanceof FormData;
            return apiClient.post<StaffProfile>(`${BASE}/staff/`, data, {
                headers: isFormData ? { "Content-Type": "multipart/form-data" } : {},
            });
        },
        update: (id: number, data: FormData | Partial<StaffProfile>) => {
            const isFormData = data instanceof FormData;
            return apiClient.patch<StaffProfile>(`${BASE}/staff/${id}/`, data, {
                headers: isFormData ? { "Content-Type": "multipart/form-data" } : {},
            });
        },
        delete: (id: number) =>
            apiClient.delete(`${BASE}/staff/${id}/`),
        myProfile: () =>
            apiClient.get<StaffProfile>(`${BASE}/staff/my_profile/`),
        orgChart: () =>
            apiClient.get(`${BASE}/staff/org_chart/`),
        summary: () =>
            apiClient.get<StaffSummary>(`${BASE}/staff/summary/`),
        bulkUpdateStatus: (ids: number[], status: string) =>
            apiClient.post(`${BASE}/staff/bulk_update_status/`, { ids, status }),
        bulkDelete: (ids: number[]) =>
            apiClient.post(`${BASE}/staff/bulk_delete/`, { ids }),
    },

    // ------- Leave Types -------
    leaveTypes: {
        list: (params?: { search?: string }) =>
            apiClient.get<PaginatedResponse<LeaveType>>(`${BASE}/leave-types/`, { params }),
        get: (id: number) =>
            apiClient.get<LeaveType>(`${BASE}/leave-types/${id}/`),
        create: (data: Partial<LeaveType>) =>
            apiClient.post<LeaveType>(`${BASE}/leave-types/`, data),
        update: (id: number, data: Partial<LeaveType>) =>
            apiClient.patch<LeaveType>(`${BASE}/leave-types/${id}/`, data),
        delete: (id: number) =>
            apiClient.delete(`${BASE}/leave-types/${id}/`),
    },

    // ------- Leave Balances -------
    leaveBalances: {
        list: (params?: { staff?: number; year?: number }) =>
            apiClient.get<PaginatedResponse<LeaveBalance>>(`${BASE}/leave-balances/`, { params }),
        myBalances: (year?: number) =>
            apiClient.get<LeaveBalance[]>(`${BASE}/leave-balances/my_balances/`, { params: { year } }),
    },

    // ------- Leave Requests -------
    leaveRequests: {
        list: (params?: {
            page?: number;
            staff?: number;
            status?: string;
            leave_type?: number;
        }) =>
            apiClient.get<PaginatedResponse<LeaveRequest>>(`${BASE}/leave-requests/`, { params }),
        get: (id: number) =>
            apiClient.get<LeaveRequest>(`${BASE}/leave-requests/${id}/`),
        create: (data: Partial<LeaveRequest>) =>
            apiClient.post<LeaveRequest>(`${BASE}/leave-requests/`, data),
        approve: (id: number, notes?: string) =>
            apiClient.post<LeaveRequest>(`${BASE}/leave-requests/${id}/approve/`, { notes }),
        reject: (id: number, notes?: string) =>
            apiClient.post<LeaveRequest>(`${BASE}/leave-requests/${id}/reject/`, { notes }),
        cancel: (id: number) =>
            apiClient.post<LeaveRequest>(`${BASE}/leave-requests/${id}/cancel/`),
        myRequests: () =>
            apiClient.get<LeaveRequest[]>(`${BASE}/leave-requests/my_requests/`),
        pending: () =>
            apiClient.get<LeaveRequest[]>(`${BASE}/leave-requests/pending/`),
        update: (id: number, data: Partial<LeaveRequest>) =>
            apiClient.patch<LeaveRequest>(`${BASE}/leave-requests/${id}/`, data),
        delete: (id: number) =>
            apiClient.delete(`${BASE}/leave-requests/${id}/`),
    },

    // ------- Attendance -------
    attendance: {
        list: (params?: {
            page?: number;
            staff?: number;
            date?: string;
            status?: string;
            branch?: number;
            search?: string;
        }) =>
            apiClient.get<PaginatedResponse<AttendanceRecord>>(`${BASE}/attendance/`, { params }),
        get: (id: number) =>
            apiClient.get<AttendanceRecord>(`${BASE}/attendance/${id}/`),
        create: (data: Partial<AttendanceRecord>) =>
            apiClient.post<AttendanceRecord>(`${BASE}/attendance/`, data),
        update: (id: number, data: Partial<AttendanceRecord>) =>
            apiClient.patch<AttendanceRecord>(`${BASE}/attendance/${id}/`, data),
        clockIn: () =>
            apiClient.post<AttendanceRecord>(`${BASE}/attendance/clock_in/`),
        clockOut: () =>
            apiClient.post<AttendanceRecord>(`${BASE}/attendance/clock_out/`),
        delete: (id: number) =>
            apiClient.delete(`${BASE}/attendance/${id}/`),
        myAttendance: (params?: { start_date?: string; end_date?: string }) =>
            apiClient.get<PaginatedResponse<AttendanceRecord>>(`${BASE}/attendance/my_attendance/`, { params }),
        todaySummary: () =>
            apiClient.get<AttendanceSummary>(`${BASE}/attendance/today_summary/`),
    },

    // ------- Attendance Policies -------
    attendancePolicies: {
        list: (params?: { branch?: number }) =>
            apiClient.get<PaginatedResponse<AttendancePolicy>>(`${BASE}/attendance-policies/`, { params }),
        get: (id: number) =>
            apiClient.get<AttendancePolicy>(`${BASE}/attendance-policies/${id}/`),
        create: (data: Partial<AttendancePolicy>) =>
            apiClient.post<AttendancePolicy>(`${BASE}/attendance-policies/`, data),
        update: (id: number, data: Partial<AttendancePolicy>) =>
            apiClient.patch<AttendancePolicy>(`${BASE}/attendance-policies/${id}/`, data),
        delete: (id: number) =>
            apiClient.delete(`${BASE}/attendance-policies/${id}/`),
    },

    // ------- Payroll -------
    payrollPeriods: {
        list: (params?: { branch?: number; status?: string; page?: number }) =>
            apiClient.get<PaginatedResponse<PayrollPeriod>>(`${BASE}/payroll-periods/`, { params }),
        get: (id: number) =>
            apiClient.get<PayrollPeriod>(`${BASE}/payroll-periods/${id}/`),
        create: (data: Partial<PayrollPeriod>) =>
            apiClient.post<PayrollPeriod>(`${BASE}/payroll-periods/`, data),
        update: (id: number, data: Partial<PayrollPeriod>) =>
            apiClient.patch<PayrollPeriod>(`${BASE}/payroll-periods/${id}/`, data),
        process: (id: number) =>
            apiClient.post(`${BASE}/payroll-periods/${id}/process/`),
        approve: (id: number) =>
            apiClient.post<PayrollPeriod>(`${BASE}/payroll-periods/${id}/approve/`),
        markPaid: (id: number, data?: { payment_date?: string; payment_reference?: string; payment_batch_reference?: string }) =>
            apiClient.post<PayrollPeriod>(`${BASE}/payroll-periods/${id}/mark_paid/`, data),
        reverse: (id: number, data: { reason: string }) =>
            apiClient.post<PayrollPeriod>(`${BASE}/payroll-periods/${id}/reverse/`, data),
        delete: (id: number) =>
            apiClient.delete(`${BASE}/payroll-periods/${id}/`),
    },

    payslips: {
        list: (params?: { payroll_period?: number; staff?: number; status?: string }) =>
            apiClient.get<PaginatedResponse<PaySlip>>(`${BASE}/payslips/`, { params }),
        get: (id: number) =>
            apiClient.get<PaySlip>(`${BASE}/payslips/${id}/`),
        myPayslips: () =>
            apiClient.get<PaySlip[]>(`${BASE}/payslips/my_payslips/`),
        downloadPdf: (id: number) =>
            apiClient.get(`${BASE}/payslips/${id}/download_pdf/`, { responseType: 'blob' }),
        update: (id: number, data: Partial<Omit<PaySlip, "allowances" | "deductions">> & { allowances?: unknown; deductions?: unknown }) =>
            apiClient.patch<PaySlip>(`${BASE}/payslips/${id}/`, data),
        delete: (id: number) =>
            apiClient.delete(`${BASE}/payslips/${id}/`),
    },

    salaryComponents: {
        list: (params?: { component_type?: string; is_active?: boolean }) =>
            apiClient.get<PaginatedResponse<SalaryComponent>>(`${BASE}/salary-components/`, { params }),
        get: (id: number) =>
            apiClient.get<SalaryComponent>(`${BASE}/salary-components/${id}/`),
        create: (data: Partial<SalaryComponent>) =>
            apiClient.post<SalaryComponent>(`${BASE}/salary-components/`, data),
        update: (id: number, data: Partial<SalaryComponent>) =>
            apiClient.patch<SalaryComponent>(`${BASE}/salary-components/${id}/`, data),
        delete: (id: number) =>
            apiClient.delete(`${BASE}/salary-components/${id}/`),
    },

    employeeSalaryComponents: {
        list: (params?: { employee?: number; component?: number; status?: string }) =>
            apiClient.get<PaginatedResponse<EmployeeSalaryComponent>>(`${BASE}/employee-salary-components/`, { params }),
        get: (id: number) =>
            apiClient.get<EmployeeSalaryComponent>(`${BASE}/employee-salary-components/${id}/`),
        create: (data: Partial<EmployeeSalaryComponent>) =>
            apiClient.post<EmployeeSalaryComponent>(`${BASE}/employee-salary-components/`, data),
        update: (id: number, data: Partial<EmployeeSalaryComponent>) =>
            apiClient.patch<EmployeeSalaryComponent>(`${BASE}/employee-salary-components/${id}/`, data),
        delete: (id: number) =>
            apiClient.delete(`${BASE}/employee-salary-components/${id}/`),
    },

    taxRules: {
        list: (params?: { search?: string }) =>
            apiClient.get<PaginatedResponse<TaxRule>>(`${BASE}/tax-rules/`, { params }),
        get: (id: number) =>
            apiClient.get<TaxRule>(`${BASE}/tax-rules/${id}/`),
        create: (data: Partial<TaxRule>) =>
            apiClient.post<TaxRule>(`${BASE}/tax-rules/`, data),
        update: (id: number, data: Partial<TaxRule>) =>
            apiClient.patch<TaxRule>(`${BASE}/tax-rules/${id}/`, data),
        delete: (id: number) =>
            apiClient.delete(`${BASE}/tax-rules/${id}/`),
    },

    payrollAuditLogs: {
        list: (params?: { action?: string; employee?: number; payroll_period?: number; payslip?: number; page?: number }) =>
            apiClient.get<PaginatedResponse<PayrollAuditLog>>(`${BASE}/payroll-audit-logs/`, { params }),
    },

    // ------- Recruitment -------
    jobOpenings: {
        list: (params?: {
            page?: number; search?: string; status?: string;
            department?: number; branch?: number;
        }) =>
            apiClient.get<PaginatedResponse<JobOpening>>(`${BASE}/job-openings/`, { params }),
        get: (id: number) =>
            apiClient.get<JobOpening>(`${BASE}/job-openings/${id}/`),
        create: (data: Partial<JobOpening>) =>
            apiClient.post<JobOpening>(`${BASE}/job-openings/`, data),
        update: (id: number, data: Partial<JobOpening>) =>
            apiClient.patch<JobOpening>(`${BASE}/job-openings/${id}/`, data),
        delete: (id: number) =>
            apiClient.delete(`${BASE}/job-openings/${id}/`),
        publish: (id: number) =>
            apiClient.post<JobOpening>(`${BASE}/job-openings/${id}/publish/`),
        close: (id: number) =>
            apiClient.post<JobOpening>(`${BASE}/job-openings/${id}/close/`),
    },

    applicants: {
        list: (params?: {
            page?: number; search?: string; status?: string;
            job_opening?: number; source?: string;
        }) =>
            apiClient.get<PaginatedResponse<Applicant>>(`${BASE}/applicants/`, { params }),
        get: (id: number) =>
            apiClient.get<Applicant>(`${BASE}/applicants/${id}/`),
        create: (data: Partial<Applicant>) =>
            apiClient.post<Applicant>(`${BASE}/applicants/`, data),
        update: (id: number, data: Partial<Applicant>) =>
            apiClient.patch<Applicant>(`${BASE}/applicants/${id}/`, data),
        moveToStage: (id: number, status: string) =>
            apiClient.post<Applicant>(`${BASE}/applicants/${id}/move_to_stage/`, { status }),
        hire: (id: number) =>
            apiClient.post(`${BASE}/applicants/${id}/hire/`),
        delete: (id: number) =>
            apiClient.delete(`${BASE}/applicants/${id}/`),
    },

    interviews: {
        list: (params?: { applicant?: number; interviewer?: number; status?: string }) =>
            apiClient.get<PaginatedResponse<Interview>>(`${BASE}/interviews/`, { params }),
        get: (id: number) =>
            apiClient.get<Interview>(`${BASE}/interviews/${id}/`),
        create: (data: Partial<Interview>) =>
            apiClient.post<Interview>(`${BASE}/interviews/`, data),
        update: (id: number, data: Partial<Interview>) =>
            apiClient.patch<Interview>(`${BASE}/interviews/${id}/`, data),
        delete: (id: number) =>
            apiClient.delete(`${BASE}/interviews/${id}/`),
    },

    // ------- Performance -------
    performanceReviews: {
        list: (params?: { page?: number; staff?: number; status?: string }) =>
            apiClient.get<PaginatedResponse<PerformanceReview>>(`${BASE}/performance-reviews/`, { params }),
        get: (id: number) =>
            apiClient.get<PerformanceReview>(`${BASE}/performance-reviews/${id}/`),
        create: (data: Partial<PerformanceReview>) =>
            apiClient.post<PerformanceReview>(`${BASE}/performance-reviews/`, data),
        update: (id: number, data: Partial<PerformanceReview>) =>
            apiClient.patch<PerformanceReview>(`${BASE}/performance-reviews/${id}/`, data),
        submit: (id: number) =>
            apiClient.post<PerformanceReview>(`${BASE}/performance-reviews/${id}/submit/`),
        acknowledge: (id: number, comments?: string) =>
            apiClient.post<PerformanceReview>(`${BASE}/performance-reviews/${id}/acknowledge/`, { comments }),
        delete: (id: number) =>
            apiClient.delete(`${BASE}/performance-reviews/${id}/`),
    },

    // ------- Training -------
    trainingPrograms: {
        list: (params?: { department?: number; is_mandatory?: boolean; search?: string }) =>
            apiClient.get<PaginatedResponse<TrainingProgram>>(`${BASE}/training-programs/`, { params }),
        get: (id: number) =>
            apiClient.get<TrainingProgram>(`${BASE}/training-programs/${id}/`),
        create: (data: Partial<TrainingProgram>) =>
            apiClient.post<TrainingProgram>(`${BASE}/training-programs/`, data),
        update: (id: number, data: Partial<TrainingProgram>) =>
            apiClient.patch<TrainingProgram>(`${BASE}/training-programs/${id}/`, data),
        enroll: (id: number, staffId: number) =>
            apiClient.post(`${BASE}/training-programs/${id}/enroll/`, { staff_id: staffId }),
        delete: (id: number) =>
            apiClient.delete(`${BASE}/training-programs/${id}/`),
    },

    staffTraining: {
        list: (params?: { staff?: number; training?: number; status?: string }) =>
            apiClient.get<PaginatedResponse<StaffTraining>>(`${BASE}/staff-training/`, { params }),
        get: (id: number) =>
            apiClient.get<StaffTraining>(`${BASE}/staff-training/${id}/`),
        update: (id: number, data: Partial<StaffTraining>) =>
            apiClient.patch<StaffTraining>(`${BASE}/staff-training/${id}/`, data),
        delete: (id: number) =>
            apiClient.delete(`${BASE}/staff-training/${id}/`),
    },

    // ------- Compliance -------
    complianceDocuments: {
        list: (params?: {
            page?: number; staff?: number;
            document_type?: string; status?: string; search?: string;
        }) =>
            apiClient.get<PaginatedResponse<ComplianceDocument>>(`${BASE}/compliance-documents/`, { params }),
        get: (id: number) =>
            apiClient.get<ComplianceDocument>(`${BASE}/compliance-documents/${id}/`),
        create: (data: FormData) =>
            apiClient.post<ComplianceDocument>(`${BASE}/compliance-documents/`, data, {
                headers: { "Content-Type": "multipart/form-data" },
            }),
        update: (id: number, data: Partial<ComplianceDocument>) =>
            apiClient.patch<ComplianceDocument>(`${BASE}/compliance-documents/${id}/`, data),
        delete: (id: number) =>
            apiClient.delete(`${BASE}/compliance-documents/${id}/`),
        expiringSoon: () =>
            apiClient.get<ComplianceDocument[]>(`${BASE}/compliance-documents/expiring_soon/`),
    },
};

export default hrApi;
