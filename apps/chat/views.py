from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import Conversation, ChatMessage
from .serializers import ConversationSerializer, ChatMessageSerializer

class ConversationViewSet(viewsets.ModelViewSet):
    serializer_class = ConversationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        # Only show conversations where the user is a participant
        return Conversation.objects.filter(participants=self.request.user)

    def perform_create(self, serializer):
        # Automatically add the creator to participants
        conversation = serializer.save()
        conversation.participants.add(self.request.user)

    @action(detail=True, methods=['get'])
    def messages(self, request, pk=None):
        conversation = self.get_object()
        messages = conversation.messages.all()
        page = self.paginate_queryset(messages)
        if page is not None:
            serializer = ChatMessageSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        
        serializer = ChatMessageSerializer(messages, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['post'])
    def get_or_create_by_object(self, request):
        object_type = request.data.get('related_object_type')
        object_id = request.data.get('related_object_id')
        
        if not object_type or not object_id:
            return Response({"error": "Missing related_object_type or related_object_id"}, status=status.HTTP_400_BAD_REQUEST)
            
        conversation = Conversation.objects.filter(
            related_object_type=object_type,
            related_object_id=object_id,
            participants=request.user
        ).first()
        
        if not conversation:
            # Create a new conversation for this object
            title = f"Chat for {object_type} #{object_id}"
            conversation = Conversation.objects.create(
                related_object_type=object_type,
                related_object_id=object_id,
                title=title
            )
            conversation.participants.add(request.user)
            # Find the customer related to the work order if possible
            if object_type == "workorder":
                try:
                    from apps.workorders.models import WorkOrder
                    wo = WorkOrder.objects.get(id=object_id)
                    if wo.customer and wo.customer.user:
                        conversation.participants.add(wo.customer.user)
                except Exception:
                    pass

        serializer = self.get_serializer(conversation)
        return Response(serializer.data)

class ChatMessageViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = ChatMessageSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return ChatMessage.objects.filter(conversation__participants=self.request.user)
