from rest_framework import serializers
from .models import Feedback

class FeedbackSerializer(serializers.ModelSerializer):
    category_display = serializers.CharField(source='get_category_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    branch_name = serializers.CharField(source='branch.name', read_only=True)

    class Meta:
        model = Feedback
        fields = [
            'id', 'message', 'category', 'category_display', 
            'status', 'status_display', 'internal_notes',
            'branch', 'branch_name', 'is_anonymous',
            'name', 'email', 'phone', 
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate(self, data):
        """
        Validate that contact info is provided if not anonymous (though we default to anonymous).
        """
        if not data.get('is_anonymous', True):
            if not data.get('name') or not (data.get('email') or data.get('phone')):
                raise serializers.ValidationError(
                    "Name and at least one contact method (email or phone) are required for non-anonymous feedback."
                )
        return data
