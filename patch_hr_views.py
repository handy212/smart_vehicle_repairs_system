import re
import os

source_file = 'apps/hr/views.py'

with open(source_file, 'r') as f:
    text = f.read()

def inject_permissions(class_name, view_perm, manage_perm):
    global text
    
    # We look for:
    # class class_name(viewsets.ModelViewSet):
    #     ...
    #     permission_classes = [IsAuthenticated]
    
    # regex to find the class and permission_classes
    pattern = rf"(class {class_name}\(.*?:\n(?: {4}.*\n)*?) {4}permission_classes = \[IsAuthenticated\]\n"
    
    replacement = rf"\1    def get_permissions(self):\n        permission_classes = [IsAuthenticated]\n        if self.action in ['list', 'retrieve']:\n            permission_classes.append(HasPermission('{view_perm}'))\n        else:\n            permission_classes.append(HasPermission('{manage_perm}'))\n        return [permission() for permission in permission_classes]\n"
    
    new_text, count = re.subn(pattern, replacement, text)
    if count == 0:
        print(f"Failed to replace for {class_name}")
    text = new_text

# Specific map
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

for cls, (vp, mp) in mapping.items():
    inject_permissions(cls, vp, mp)

# For EmployeeProfileViewSet
pattern = rf"(class EmployeeProfileViewSet\(.*?:\n {4}permission_classes = \[IsAuthenticated\]\n)"
rep = rf"class EmployeeProfileViewSet(viewsets.ModelViewSet):\n    def get_permissions(self):\n        permission_classes = [IsAuthenticated]\n        if self.action in ['my_profile', 'org_chart', 'summary']:\n            pass\n        elif self.action in ['list', 'retrieve']:\n            permission_classes.append(HasPermission('view_staff'))\n        else:\n            permission_classes.append(HasPermission('manage_staff'))\n        return [permission() for permission in permission_classes]\n"
text, c = re.subn(pattern, rep, text)
if c == 0:
    print("Failed EmployeeProfileViewSet")

# For LeaveRequestViewSet
pattern = rf"(class LeaveRequestViewSet\(.*?:\n(?: {4}.*\n)*?) {4}permission_classes = \[IsAuthenticated\]\n"
rep = rf"\1    def get_permissions(self):\n        permission_classes = [IsAuthenticated]\n        if self.action in ['my_requests', 'create', 'cancel']:\n            pass\n        elif self.action in ['list', 'retrieve', 'pending']:\n            permission_classes.append(HasPermission('view_leave'))\n        elif self.action in ['approve', 'reject']:\n            permission_classes.append(HasPermission('approve_leave'))\n        else:\n            permission_classes.append(HasPermission('manage_leave'))\n        return [permission() for permission in permission_classes]\n"
text, c = re.subn(pattern, rep, text)
if c == 0:
    print("Failed LeaveRequestViewSet")

# For AttendanceViewSet
pattern = rf"(class AttendanceViewSet\(.*?:\n(?: {4}.*\n)*?) {4}permission_classes = \[IsAuthenticated\]\n"
rep = rf"\1    def get_permissions(self):\n        permission_classes = [IsAuthenticated]\n        if self.action in ['clock_in', 'clock_out', 'my_attendance', 'status']:\n            pass\n        elif self.action in ['list', 'retrieve']:\n            permission_classes.append(HasPermission('view_attendance'))\n        else:\n            permission_classes.append(HasPermission('manage_attendance'))\n        return [permission() for permission in permission_classes]\n"
text, c = re.subn(pattern, rep, text)
if c == 0:
    print("Failed AttendanceViewSet")

# For PaySlipViewSet
pattern = rf"(class PaySlipViewSet\(.*?:\n(?: {4}.*\n)*?) {4}permission_classes = \[IsAuthenticated\]\n"
rep = rf"\1    def get_permissions(self):\n        permission_classes = [IsAuthenticated]\n        if self.action in ['my_slips', 'download_pdf']:\n            pass\n        elif self.action in ['list', 'retrieve']:\n            permission_classes.append(HasPermission('view_payroll'))\n        else:\n            permission_classes.append(HasPermission('manage_payroll'))\n        return [permission() for permission in permission_classes]\n"
text, c = re.subn(pattern, rep, text)
if c == 0:
    print("Failed PaySlipViewSet")

with open(source_file, 'w') as f:
    f.write(text)

print("Done patching.")
