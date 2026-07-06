from django.contrib import admin

from .models import (
    WorkflowAction,
    WorkflowDefinition,
    WorkflowGuard,
    WorkflowInstance,
    WorkflowState,
    WorkflowTransition,
    WorkflowTransitionLog,
)


class WorkflowStateInline(admin.TabularInline):
    model = WorkflowState
    extra = 0


class WorkflowTransitionInline(admin.TabularInline):
    model = WorkflowTransition
    extra = 0
    fk_name = 'workflow'


@admin.register(WorkflowDefinition)
class WorkflowDefinitionAdmin(admin.ModelAdmin):
    list_display = ('name', 'code', 'model_path', 'version', 'is_default', 'is_active')
    list_filter = ('model_path', 'is_default', 'is_active')
    search_fields = ('name', 'code', 'description')
    prepopulated_fields = {'code': ('name',)}
    inlines = [WorkflowStateInline, WorkflowTransitionInline]


@admin.register(WorkflowState)
class WorkflowStateAdmin(admin.ModelAdmin):
    list_display = ('label', 'key', 'workflow', 'order', 'is_initial', 'is_terminal', 'is_active')
    list_filter = ('workflow', 'is_initial', 'is_terminal', 'is_active')
    search_fields = ('label', 'key', 'workflow__name')


@admin.register(WorkflowTransition)
class WorkflowTransitionAdmin(admin.ModelAdmin):
    list_display = ('label', 'workflow', 'from_state', 'to_state', 'order', 'is_active')
    list_filter = ('workflow', 'is_active')
    search_fields = ('label', 'from_state__key', 'to_state__key')


@admin.register(WorkflowGuard)
class WorkflowGuardAdmin(admin.ModelAdmin):
    list_display = ('transition', 'guard_type', 'field_path', 'message', 'is_active')
    list_filter = ('guard_type', 'is_active')
    search_fields = ('field_path', 'message')


@admin.register(WorkflowAction)
class WorkflowActionAdmin(admin.ModelAdmin):
    list_display = ('label', 'transition', 'action_type', 'timing', 'order', 'is_active')
    list_filter = ('action_type', 'timing', 'is_active')
    search_fields = ('label', 'transition__label')


@admin.register(WorkflowInstance)
class WorkflowInstanceAdmin(admin.ModelAdmin):
    list_display = ('workflow', 'content_type', 'object_id', 'current_state', 'is_active', 'updated_at')
    list_filter = ('workflow', 'current_state', 'is_active')
    search_fields = ('workflow__name', 'current_state__key', 'object_id')
    readonly_fields = ('started_at', 'completed_at', 'created_at', 'updated_at')


@admin.register(WorkflowTransitionLog)
class WorkflowTransitionLogAdmin(admin.ModelAdmin):
    list_display = ('instance', 'from_state', 'to_state', 'result', 'actor', 'created_at')
    list_filter = ('result', 'from_state', 'to_state', 'created_at')
    search_fields = ('message', 'from_state', 'to_state', 'actor__email')
    readonly_fields = (
        'instance', 'transition', 'from_state', 'to_state', 'result', 'message',
        'guard_results', 'action_results', 'actor', 'metadata', 'created_at',
    )
