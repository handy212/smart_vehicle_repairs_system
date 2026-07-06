import apiClient from "./client";

export interface ChatUser {
  id: number;
  email: string;
  username: string;
  first_name: string;
  last_name: string;
  full_name: string;
  role: string;
  is_online: boolean;
  profile_picture?: string;
  avatar_url?: string;
  last_seen?: string;
}

export interface ChatDiscoveryResponse {
  staff: ChatUser[];
  clients: ChatUser[];
}

export interface ChatMembership {
  user: ChatUser;
  role: 'member' | 'admin';
  last_read_at: string;
  joined_at: string;
}

export interface ParentMessage {
  id: number;
  message: string;
  sender_name: string;
  timestamp: string;
}

export interface Conversation {
  id: number;
  type: 'private' | 'group' | 'system';
  title: string;
  room_id?: string;
  is_archived: boolean;
  updated_at: string;
  created_at: string;
  related_object_type?: string;
  related_object_id?: string;
  memberships: ChatMembership[];
  unread_count: number;
  last_message?: {
    id: number;
    message: string;
    message_type: 'text' | 'image' | 'file' | 'system';
    sender_name: string;
    sender_id: number | null;
    timestamp: string;
    is_read: boolean;
  };
}

export interface ChatMessage {
  id: number;
  conversation: number;
  sender: number | null;
  sender_id: number | null;
  sender_name: string;
  sender_email: string | null;
  message_type: 'text' | 'image' | 'file' | 'system';
  message: string;
  attachment?: string;
  metadata: Record<string, unknown>;
  parent_message?: number | null;
  parent_message_detail?: ParentMessage | null;
  timestamp: string;
  is_read: boolean;
  read_at?: string | null;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export const chatApi = {
  conversations: {
    list: () =>
      apiClient.get<Conversation[]>("/chat/conversations/").then(res => res.data),
    get: (id: number) =>
      apiClient.get<Conversation>(`/chat/conversations/${id}/`).then(res => res.data),
    messages: (id: number, page = 1) =>
      apiClient
        .get<PaginatedResponse<ChatMessage> | ChatMessage[]>(
          `/chat/conversations/${id}/messages/`,
          { params: { page } }
        )
        .then(res => res.data),
    getOrCreateByObject: (objectType: string, objectId: string | number) =>
      apiClient
        .post<Conversation>("/chat/conversations/get_or_create_by_object/", {
          related_object_type: objectType,
          related_object_id: objectId,
        })
        .then(res => res.data),
    create: (data: {
      title?: string;
      type: 'private' | 'group';
      participant_ids: number[];
    }) =>
      apiClient.post<Conversation>("/chat/conversations/", data).then(res => res.data),
    discovery: () =>
      apiClient
        .get<ChatDiscoveryResponse>('/chat/conversations/discovery/')
        .then(res => res.data),
    markAllRead: (id: number) =>
      apiClient
        .post(`/chat/conversations/${id}/mark_all_read/`)
        .then(res => res.data),
    archive: (id: number) =>
      apiClient
        .post(`/chat/conversations/${id}/archive/`)
        .then(res => res.data),
  },
  messages: {
    markAsRead: (id: number) =>
      apiClient.post(`/chat/messages/${id}/mark_as_read/`).then(res => res.data),
  },
};
