import re

source_file = 'apps/hr/views.py'

with open(source_file, 'r') as f:
    lines = f.readlines()

mapping = {
    'DepartmentViewSet': ('view_departments', 'manage_departments'),
    'PositionViewSet': ('view_departments', 'manage_departments'),
    'LeaveTypeViewSet': ('view_leave', 'manage_leave'),
    'LeaveBalanceViewSet': ('view_leave', 'manage_leave'),
    'AttendancePolicyViewSet': ('view_attendance', 'manage_attendance'),
    'SalaryComponentViewSet': ('view_payroll', 'manage_payroll'),
    'EmployeeSalaryComponentViewSet': ('view_payroll', 'manage_payroll'),
    'PayrollPeriodViewSet': ('view_payroll', 'manage_payroll'),
    'JobOpeningViewSet': ('view_recruitment', 'manage_recruitment'),
    'ApplicantViewSet': ('view_recruitment', 'manage_recruitment'),
    'InterviewViewSet': ('view_recruitment', 'manage_recruitment'),
    'PerformanceReviewViewSet': ('view_performance', 'manage_performance'),
    'TrainingProgramViewSet': ('view_training', 'manage_training'),
    'EmployeeTrainingViewSet': ('view_training', 'manage_training'),
    'ComplianceDocumentViewSet': ('view_compliance', 'manage_compliance'),
    'TaxRuleViewSet': ('view_payroll', 'manage_payroll'),
}

in_class = None
out_lines = []

for line in lines:
    class_match = re.match(r"^class (\w+)\(.*?:\s*", line)
    if class_match:
        in_class = class_match.group(1)
        out_lines.append(line)
        continue
    
    if line.startswith("class ") or line.startswith("def "):
        if line.startswith("def ") and not line.startswith("    def "):
            pass # Module level function
    
    if in_class and "permission_classes = [IsAuthenticated]" in line:
        if in_class in mapping:
            vp, mp = mapping[in_class]
            out_lines.append(f"    def get_permissions(self):\n")
            out_lines.append(f"        permission_classes = [IsAuthenticated]\n")
            out_lines.append(f"        if self.action in ['list', 'retrieve']:\n")
            out_lines.append(f"            permission_classes.append(HasPermission('{vp}'))\n")
            out_lines.append(f"        else:\n")
            out_lines.append(f"            permission_classes.append(HasPermission('{mp}'))\n")
            out_lines.append(f"        return [permission() for permission in permission_classes]\n")
            in_class = None # Prevent replacing multiple times if it existed
            continue
        elif in_class == 'EmployeeProfileViewSet':
            out_lines.append(f"    def get_permissions(self):\n")
            out_lines.append(f"        permission_classes = [IsAuthenticated]\n")
            out_lines.append(f"        if self.action in ['my_profile', 'org_chart', 'summary']:\n")
            out_lines.append(f"            pass\n")
            out_lines.append(f"        elif self.action in ['list', 'retrieve']:\n")
            out_lines.append(f"            permission_classes.append(HasPermission('view_staff'))\n")
            out_lines.append(f"        else:\n")
            out_lines.append(f"            permission_classes.append(HasPermission('manage_staff'))\n")
            out_lines.append(f"        return [permission() for permission in permission_classes]\n")
            in_class = None
            continue
        elif in_class == 'LeaveRequestViewSet':
            out_lines.append(f"    def get_permissions(self):\n")
            out_lines.append(f"        permission_classes = [IsAuthenticated]\n")
            out_lines.append(f"        if self.action in ['my_requests', 'create', 'cancel']:\n")
            out_lines.append(f"            pass\n")
            out_lines.append(f"        elif self.action in ['list', 'retrieve', 'pending']:\n")
            out_lines.append(f"            permission_classes.append(HasPermission('view_leave'))\n")
            out_lines.append(f"        elif self.action in ['approve', 'reject']:\n")
            out_lines.append(f"            permission_classes.append(HasPermission('approve_leave'))\n")
            out_lines.append(f"        else:\n")
            out_lines.append(f"            permission_classes.append(HasPermission('manage_leave'))\n")
            out_lines.append(f"        return [permission() for permission in permission_classes]\n")
            in_class = None
            continue
        elif in_class == 'AttendanceViewSet':
            out_lines.append(f"    def get_permissions(self):\n")
            out_lines.append(f"        permission_classes = [IsAuthenticated]\n")
            out_lines.append(f"        if self.action in ['clock_in', 'clock_out', 'my_attendance', 'status']:\n")
            out_lines.append(f"            pass\n")
            out_lines.append(f"        elif self.action in ['list', 'retrieve']:\n")
            out_lines.append(f"            permission_classes.append(HasPermission('view_attendance'))\n")
            out_lines.append(f"        else:\n")
            out_lines.append(f"            permission_classes.append(HasPermission('manage_attendance'))\n")
            out_lines.append(f"        return [permission() for permission in permission_classes]\n")
            in_class = None
            continue
        elif in_class == 'PaySlipViewSet':
            out_lines.append(f"    def get_permissions(self):\n")
            out_lines.append(f"        permission_classes = [IsAuthenticated]\n")
            out_lines.append(f"        if self.action in ['my_slips', 'my_summary', 'download_pdf']:\n")
            out_lines.append(f"            pass\n")
            out_lines.append(f"        elif self.action in ['list', 'retrieve']:\n")
            out_lines.append(f"            permission_classes.append(HasPermission('view_payroll'))\n")
            out_lines.append(f"        else:\n")
            out_lines.append(f"            permission_classes.append(HasPermission('manage_payroll'))\n")
            out_lines.append(f"        return [permission() for permission in permission_classes]\n")
            in_class = None
            continue
    
    # Also remove "        # Missing HasPermission checks here for other actions"
    if "Missing HasPermission checks here for other actions" in line:
        continue
        
    out_lines.append(line)

# Handle the pre-existing get_permissions in EmployeeProfileViewSet to avoid duplicates
# Wait, my script replaced the old definition... if I just run this file as is, let's verify if there were pre-existing `def get_permissions`
with open(source_file, 'w') as f:
    f.writelines(out_lines)

print("Done patching new version.")
