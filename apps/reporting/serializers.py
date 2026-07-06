from datetime import timedelta

from django.utils import timezone
from rest_framework import serializers

from .models import AIAuditLog, ReportExportLog, ReportSchedule, SavedReport


class SavedReportSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)

    class Meta:
        model = SavedReport
        fields = [
            'id', 'name', 'report_type', 'description', 'parameters',
            'is_public', 'created_by', 'created_by_name', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_by', 'created_by_name', 'created_at', 'updated_at']


class ReportScheduleSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)

    class Meta:
        model = ReportSchedule
        fields = [
            'id', 'name', 'report_type', 'frequency', 'email_recipients',
            'is_active', 'next_run_date', 'last_run_date', 'parameters',
            'created_by', 'created_by_name', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_by', 'created_by_name', 'last_run_date', 'created_at', 'updated_at']
        extra_kwargs = {
            'next_run_date': {'required': False},
        }

    def validate_email_recipients(self, value):
        emails = [email.strip() for email in value.split(',') if email.strip()]
        if not emails:
            raise serializers.ValidationError('At least one email recipient is required')
        validator = serializers.EmailField()
        for email in emails:
            validator.run_validation(email)
        return ', '.join(emails)

    def validate_parameters(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError('Parameters must be an object')
        return value

    def create(self, validated_data):
        if not validated_data.get('next_run_date'):
            frequency = validated_data.get('frequency')
            now = timezone.now()
            offsets = {
                'daily': timedelta(days=1),
                'weekly': timedelta(days=7),
                'monthly': timedelta(days=30),
                'quarterly': timedelta(days=90),
            }
            validated_data['next_run_date'] = now + offsets.get(frequency, timedelta(days=1))
        return super().create(validated_data)


class ReportExportLogSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)

    class Meta:
        model = ReportExportLog
        fields = [
            'id', 'report_type', 'report_name', 'export_format', 'status',
            'parameters', 'file_name', 'error_message', 'ip_address',
            'user_agent', 'created_by', 'created_by_name', 'created_at'
        ]
        read_only_fields = ['id', 'ip_address', 'user_agent', 'created_by', 'created_by_name', 'created_at']


class AIAuditLogSerializer(serializers.ModelSerializer):
    user_email = serializers.SerializerMethodField()

    class Meta:
        model = AIAuditLog
        fields = [
            'id',
            'feature',
            'prompt_summary',
            'output_summary',
            'user',
            'user_email',
            'branch_id',
            'success',
            'error_message',
            'created_at',
        ]
        read_only_fields = fields

    def get_user_email(self, obj):
        if obj.user_id and obj.user:
            return obj.user.email or str(obj.user)
        return None
