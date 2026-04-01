from django.contrib import admin, messages
from django.shortcuts import redirect
from django.urls import path, reverse
from apps.diagnosis.models import (
    Diagnosis, RepairRecommendation,
    DiagnosticCode, DiagnosticTest,
    DiagnosisFinding, DiagnosisPhoto,
    TestProcedureLibrary, DiagnosticCodeLibrary,
    DiagnosisHistory
)
from apps.diagnosis.services.baseline_test_procedures import seed_baseline_test_procedures


@admin.register(Diagnosis)
class DiagnosisAdmin(admin.ModelAdmin):
    list_display = [
        'id', 'work_order', 'technician', 'status',
        'started_at', 'completed_at', 'diagnostic_fee', 'is_completed'
    ]
    list_filter = ['status', 'is_completed', 'requires_approval', 'started_at']
    search_fields = [
        'work_order__work_order_number', 'customer_complaint',
        'root_cause', 'diagnostic_notes'
    ]
    readonly_fields = ['created_at', 'updated_at']
    fieldsets = (
        ('Work Order', {
            'fields': ('work_order', 'technician')
        }),
        ('Timing', {
            'fields': ('started_at', 'completed_at', 'status')
        }),
        ('Customer Information', {
            'fields': ('customer_complaint', 'initial_observations')
        }),
        ('Diagnostic Process', {
            'fields': (
                'diagnostic_notes', 'diagnostic_time_hours',
                'diagnostic_fee'
            )
        }),
        ('Findings', {
            'fields': ('root_cause', 'root_cause_explanation')
        }),
        ('Status', {
            'fields': ('is_completed', 'requires_approval')
        }),
        ('Metadata', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )


@admin.register(RepairRecommendation)
class RepairRecommendationAdmin(admin.ModelAdmin):
    list_display = [
        'id', 'diagnosis', 'recommendation_type', 'priority',
        'approval_status', 'quotation_status', 'converted_to_task'
    ]
    list_filter = [
        'recommendation_type', 'priority', 'approval_status', 'quotation_status',
        'converted_to_task', 'created_at'
    ]
    search_fields = ['description', 'diagnosis__work_order__work_order_number']
    readonly_fields = [
        'estimated_total_cost', 'decision_at', 'decision_by',
        'quotation_requested_at', 'quotation_requested_by',
        'quoted_at', 'quoted_by', 'created_at', 'updated_at'
    ]
    fieldsets = (
        ('Diagnosis', {
            'fields': ('diagnosis',)
        }),
        ('Recommendation Details', {
            'fields': (
                'recommendation_type', 'description', 'priority', 'order'
            )
        }),
        ('Parts', {
            'fields': ('parts_needed',)
        }),
        ('Evidence', {
            'fields': ('findings',)
        }),
        ('Planning', {
            'fields': ('estimated_labor_hours',)
        }),
        ('Approval', {
            'fields': (
                'approval_status', 'decision_method', 'decision_notes',
                'decision_at', 'decision_by', 'customer_approved'
            )
        }),
        ('Quotation', {
            'fields': (
                'quotation_status', 'quotation_requested_at', 'quotation_requested_by',
                'quoted_at', 'quoted_by'
            )
        }),
        ('Execution', {
            'fields': ('converted_to_task',)
        }),
        ('Metadata', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )


# Phase 2: Structured Data Admin

@admin.register(DiagnosticCode)
class DiagnosticCodeAdmin(admin.ModelAdmin):
    list_display = [
        'id', 'code_number', 'code_type', 'severity', 'status',
        'diagnosis', 'recorded_at'
    ]
    list_filter = ['code_type', 'severity', 'status', 'recorded_at']
    search_fields = ['code_number', 'description', 'diagnosis__work_order__work_order_number']
    readonly_fields = ['created_at', 'updated_at']
    fieldsets = (
        ('Diagnosis', {
            'fields': ('diagnosis',)
        }),
        ('Code Information', {
            'fields': ('code_number', 'code_type', 'description', 'severity')
        }),
        ('Status', {
            'fields': ('status', 'recorded_at')
        }),
        ('Freeze Frame Data', {
            'fields': ('freeze_frame_data',),
            'classes': ('collapse',)
        }),
        ('Metadata', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )


@admin.register(DiagnosticTest)
class DiagnosticTestAdmin(admin.ModelAdmin):
    list_display = [
        'id', 'test_name', 'category', 'status',
        'diagnosis', 'performed_by', 'performed_at'
    ]
    list_filter = ['category', 'status', 'performed_at']
    search_fields = ['test_name', 'test_procedure', 'diagnosis__work_order__work_order_number']
    readonly_fields = ['created_at', 'updated_at']
    fieldsets = (
        ('Diagnosis', {
            'fields': ('diagnosis', 'performed_by', 'performed_at')
        }),
        ('Test Information', {
            'fields': ('test_name', 'category', 'tools_used')
        }),
        ('Test Details', {
            'fields': ('test_procedure', 'expected_result', 'actual_result')
        }),
        ('Measurements', {
            'fields': ('measurements',),
            'classes': ('collapse',)
        }),
        ('Status', {
            'fields': ('status',)
        }),
        ('Metadata', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )


@admin.register(DiagnosisFinding)
class DiagnosisFindingAdmin(admin.ModelAdmin):
    list_display = [
        'id', 'finding_title', 'category', 'severity', 'status',
        'diagnosis', 'created_at'
    ]
    list_filter = ['category', 'severity', 'status', 'created_at']
    search_fields = ['finding_title', 'description', 'diagnosis__work_order__work_order_number']
    filter_horizontal = ['diagnostic_codes', 'diagnostic_tests']
    readonly_fields = ['created_at', 'updated_at']
    fieldsets = (
        ('Diagnosis', {
            'fields': ('diagnosis',)
        }),
        ('Finding Details', {
            'fields': ('finding_title', 'category', 'description', 'severity')
        }),
        ('Evidence', {
            'fields': ('diagnostic_codes', 'diagnostic_tests')
        }),
        ('Analysis', {
            'fields': ('root_cause', 'contributing_factors')
        }),
        ('Status', {
            'fields': ('status',)
        }),
        ('Metadata', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )


@admin.register(DiagnosisPhoto)
class DiagnosisPhotoAdmin(admin.ModelAdmin):
    list_display = [
        'id', 'diagnosis', 'finding', 'photo_type',
        'caption', 'taken_by', 'taken_at'
    ]
    list_filter = ['photo_type', 'taken_at']
    search_fields = ['caption', 'diagnosis__work_order__work_order_number']
    readonly_fields = ['created_at']
    fieldsets = (
        ('Diagnosis', {
            'fields': ('diagnosis', 'finding')
        }),
        ('Photo', {
            'fields': ('photo', 'caption', 'photo_type')
        }),
        ('Metadata', {
            'fields': ('taken_at', 'taken_by', 'created_at')
        }),
    )


# Phase 3: Advanced Features Admin

@admin.register(TestProcedureLibrary)
class TestProcedureLibraryAdmin(admin.ModelAdmin):
    change_list_template = 'admin/diagnosis/testprocedurelibrary/change_list.html'
    list_display = [
        'id', 'name', 'category', 'is_active', 'use_count', 'created_by', 'created_at'
    ]
    list_filter = ['category', 'is_active', 'created_at']
    search_fields = ['name', 'description', 'test_procedure']
    readonly_fields = ['use_count', 'created_at', 'updated_at']
    fieldsets = (
        ('Test Information', {
            'fields': ('name', 'category', 'description', 'is_active')
        }),
        ('Procedure Details', {
            'fields': ('test_procedure', 'expected_result')
        }),
        ('Tools & Measurements', {
            'fields': ('tools_needed', 'measurement_fields')
        }),
        ('Statistics', {
            'fields': ('use_count',)
        }),
        ('Metadata', {
            'fields': ('created_by', 'created_at', 'updated_at')
        }),
    )

    def get_urls(self):
        urls = super().get_urls()
        custom_urls = [
            path(
                'seed-baseline/',
                self.admin_site.admin_view(self.seed_baseline_view),
                name='diagnosis_testprocedurelibrary_seed_baseline',
            ),
        ]
        return custom_urls + urls

    def changelist_view(self, request, extra_context=None):
        extra_context = extra_context or {}
        extra_context['seed_baseline_url'] = reverse(
            'admin:diagnosis_testprocedurelibrary_seed_baseline'
        )
        return super().changelist_view(request, extra_context=extra_context)

    def seed_baseline_view(self, request):
        if request.method != 'POST':
            self.message_user(
                request,
                'Invalid request method for seeding baseline procedures.',
                level=messages.ERROR,
            )
            return redirect('admin:diagnosis_testprocedurelibrary_changelist')

        result = seed_baseline_test_procedures(created_by=request.user)
        self.message_user(
            request,
            (
                f"Processed {result['total']} baseline procedures: "
                f"{result['created']} created, {result['existing']} already present."
            ),
            level=messages.SUCCESS,
        )
        return redirect('admin:diagnosis_testprocedurelibrary_changelist')


@admin.register(DiagnosticCodeLibrary)
class DiagnosticCodeLibraryAdmin(admin.ModelAdmin):
    list_display = [
        'id', 'code_number', 'code_type', 'title', 'severity',
        'is_active', 'use_count', 'created_at'
    ]
    list_filter = ['code_type', 'severity', 'is_active', 'created_at']
    search_fields = ['code_number', 'title', 'description']
    readonly_fields = ['use_count', 'created_at', 'updated_at']
    fieldsets = (
        ('Code Information', {
            'fields': ('code_number', 'code_type', 'title', 'description', 'severity')
        }),
        ('Common Information', {
            'fields': ('common_causes', 'common_fixes', 'tsb_references', 'notes')
        }),
        ('Statistics', {
            'fields': ('use_count', 'is_active')
        }),
        ('Metadata', {
            'fields': ('created_at', 'updated_at')
        }),
    )


@admin.register(DiagnosisHistory)
class DiagnosisHistoryAdmin(admin.ModelAdmin):
    list_display = [
        'id', 'vehicle_make', 'vehicle_model', 'vehicle_year',
        'diagnosis_count', 'avg_diagnostic_time', 'avg_repair_cost', 'last_updated'
    ]
    list_filter = ['vehicle_make', 'vehicle_year', 'last_updated']
    search_fields = ['vehicle_make', 'vehicle_model']
    readonly_fields = ['last_updated', 'created_at']
    fieldsets = (
        ('Vehicle', {
            'fields': ('vehicle_make', 'vehicle_model', 'vehicle_year')
        }),
        ('Common Issues', {
            'fields': ('common_complaints', 'common_root_causes', 'common_codes')
        }),
        ('Statistics', {
            'fields': (
                'diagnosis_count', 'avg_diagnostic_time', 'avg_repair_cost'
            )
        }),
        ('Metadata', {
            'fields': ('last_updated', 'created_at')
        }),
    )
