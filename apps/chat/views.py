from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from django.db import transaction
from .models import Conversation, ChatMessage, ChatMembership
from .serializers import ConversationSerializer, ChatMessageSerializer


class ConversationViewSet(viewsets.ModelViewSet):
    serializer_class = ConversationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return Conversation.objects.none()
        # Show non-archived conversations where user is a participant
        return Conversation.objects.filter(
            participants=self.request.user,
            is_archived=False
        ).prefetch_related(
            'chatmembership_set__user',
            'messages'
        ).distinct()

    def perform_create(self, serializer):
        participant_ids = self.request.data.get('participant_ids', [])

        with transaction.atomic():
            conversation = serializer.save()

            # Add creator as Admin
            ChatMembership.objects.create(
                user=self.request.user,
                conversation=conversation,
                role='admin'
            )

            # Validate and add other participants as members
            from django.contrib.auth import get_user_model
            User = get_user_model()
            valid_ids = set(
                User.objects.filter(id__in=participant_ids)
                .exclude(id=self.request.user.id)
                .values_list('id', flat=True)
            )

            memberships = [
                ChatMembership(user_id=p_id, conversation=conversation, role='member')
                for p_id in valid_ids
            ]
            ChatMembership.objects.bulk_create(memberships, ignore_conflicts=True)

    @action(detail=False, methods=['get'])
    def discovery(self, request):
        """
        Returns users available to chat categorized by staff and clients.
        """
        user = request.user
        from django.contrib.auth import get_user_model
        User = get_user_model()

        # Base querysets
        all_staff = User.objects.exclude(role='customer').exclude(id=user.id)
        all_clients = User.objects.filter(role='customer').exclude(id=user.id)

        # Role-based filtering
        if user.role == 'customer':
            staff_queryset = all_staff.filter(
                role__in=['admin', 'manager', 'service_coordinator', 'super-admin']
            )
            clients_queryset = User.objects.none()
        else:
            staff_queryset = all_staff
            clients_queryset = all_clients

        from .serializers import ChatUserSerializer
        return Response({
            "staff": ChatUserSerializer(staff_queryset, many=True, context={'request': request}).data,
            "clients": ChatUserSerializer(clients_queryset, many=True, context={'request': request}).data
        })

    @action(detail=True, methods=['post'])
    def mark_all_read(self, request, pk=None):
        conversation = self.get_object()
        unread_messages = conversation.messages.exclude(sender=request.user).filter(
            is_read=False
        )
        now = timezone.now()
        unread_messages.update(is_read=True, read_at=now)
        # Also create per-user read receipts
        from .models import MessageReadReceipt
        from django.db import IntegrityError
        receipts = [
            MessageReadReceipt(message_id=mid, user=request.user, read_at=now)
            for mid in unread_messages.values_list('id', flat=True)
        ]
        MessageReadReceipt.objects.bulk_create(receipts, ignore_conflicts=True)
        return Response({"status": "messages marked as read"})

    @action(detail=True, methods=['post'])
    def archive(self, request, pk=None):
        """Archive (soft-delete) a conversation for all members."""
        conversation = self.get_object()
        # Only admins or the conversation admin-member can archive
        membership = ChatMembership.objects.filter(
            user=request.user, conversation=conversation
        ).first()
        if not membership or membership.role != 'admin':
            return Response(
                {"error": "Only conversation admins can archive."},
                status=status.HTTP_403_FORBIDDEN
            )
        conversation.is_archived = True
        conversation.save(update_fields=['is_archived'])
        return Response({"status": "conversation archived"})

    @action(detail=True, methods=['get'])
    def messages(self, request, pk=None):
        conversation = self.get_object()
        messages = conversation.messages.all().select_related('sender', 'parent_message__sender')
        page = self.paginate_queryset(messages)
        if page is not None:
            serializer = ChatMessageSerializer(page, many=True, context={'request': request})
            return self.get_paginated_response(serializer.data)

        serializer = ChatMessageSerializer(messages, many=True, context={'request': request})
        return Response(serializer.data)

    @action(detail=False, methods=['post'])
    def get_or_create_by_object(self, request):
        object_type = request.data.get('related_object_type')
        object_id = request.data.get('related_object_id')

        if not object_type or not object_id:
            return Response(
                {"error": "Missing related_object_type or related_object_id"},
                status=status.HTTP_400_BAD_REQUEST
            )

        with transaction.atomic():
            conversation = Conversation.objects.filter(
                related_object_type=object_type,
                related_object_id=object_id,
                participants=request.user
            ).first()

            if not conversation:
                title = f"Chat for {object_type} #{object_id}"
                conversation = Conversation.objects.create(
                    related_object_type=object_type,
                    related_object_id=object_id,
                    title=title
                )
                ChatMembership.objects.get_or_create(
                    user=request.user,
                    conversation=conversation,
                    defaults={'role': 'admin'}
                )
                # Find the customer related to the work order if possible
                if object_type == "workorder":
                    try:
                        from apps.workorders.models import WorkOrder
                        wo = WorkOrder.objects.get(id=object_id)
                        if wo.customer and wo.customer.user:
                            ChatMembership.objects.get_or_create(
                                user=wo.customer.user,
                                conversation=conversation,
                                defaults={'role': 'member'}
                            )
                        if wo.service_coordinator:
                            ChatMembership.objects.get_or_create(
                                user=wo.service_coordinator,
                                conversation=conversation,
                                defaults={'role': 'member'}
                            )
                    except Exception:
                        pass

        serializer = self.get_serializer(conversation)
        return Response(serializer.data)


class ChatMessageViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = ChatMessageSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return ChatMessage.objects.none()
        return ChatMessage.objects.filter(
            conversation__participants=self.request.user
        ).select_related('sender', 'parent_message__sender')
