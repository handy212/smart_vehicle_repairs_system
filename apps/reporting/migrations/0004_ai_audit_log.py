# Generated manually for AIAuditLog model

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('reporting', '0003_alter_reportschedule_report_type_and_more'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='AIAuditLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('feature', models.CharField(
                    choices=[
                        ('comms_suggestion', 'Communication Suggestion'),
                        ('diagnosis_recommendations', 'Diagnosis Recommendations'),
                        ('diagnosis_report', 'Diagnosis Report'),
                        ('inspection_summary', 'Inspection Summary'),
                        ('photo_analysis', 'Photo Analysis'),
                        ('voice_transcription', 'Voice Transcription'),
                        ('sms_assist', 'SMS Assistant'),
                        ('ops_briefing', 'Operations Briefing'),
                        ('ops_exception_triage', 'Exception Triage'),
                        ('ops_return_jobs', 'Return Job Analysis'),
                        ('ops_capacity', 'Capacity Narrative'),
                        ('ops_ap_cycle', 'AP Cycle Narrative'),
                        ('ops_traceability', 'Traceability Q&A'),
                        ('ops_bottleneck', 'Workflow Bottleneck'),
                        ('ops_exception_draft', 'Exception Comms Draft'),
                        ('other', 'Other'),
                    ],
                    default='other',
                    max_length=50,
                )),
                ('prompt_summary', models.TextField(blank=True)),
                ('output_summary', models.TextField(blank=True)),
                ('branch_id', models.IntegerField(blank=True, null=True)),
                ('success', models.BooleanField(default=True)),
                ('error_message', models.TextField(blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('user', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='ai_audit_logs',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
        migrations.AddIndex(
            model_name='aiauditlog',
            index=models.Index(fields=['feature', 'created_at'], name='reporting_a_feature_8a1b2c_idx'),
        ),
        migrations.AddIndex(
            model_name='aiauditlog',
            index=models.Index(fields=['user', 'created_at'], name='reporting_a_user_id_3d4e5f_idx'),
        ),
    ]
