from django.contrib import admin
from .models import Feedback

@admin.register(Feedback)
class FeedbackAdmin(admin.ModelAdmin):
    list_display = ('category', 'short_message', 'branch', 'is_anonymous', 'created_at')
    list_filter = ('category', 'branch', 'is_anonymous', 'created_at')
    search_fields = ('message', 'name', 'email', 'phone')
    readonly_fields = ('created_at', 'updated_at')

    def short_message(self, obj):
        return obj.message[:50] + '...' if len(obj.message) > 50 else obj.message
    short_message.short_description = 'Message'
