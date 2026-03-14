import apiClient from "./client";

export interface Conversation {
  id: number;
  title: string;
  updated_at: string;
  related_object_type?: string;
  related_object_id?: string;
  last_message?: {
    message: string;
    timestamp: string;
  };
}

export interface ChatMessage {
  id: number;
  conversation: number;
  sender: number;
  sender_name: string;
  message: string;
  timestamp: string;
  is_read: boolean;
}

export const chatApi = {
  conversations: {
    list: () => apiClient.get<Conversation[]>("/chat/conversations/").then(res => res.data),
    get: (id: number) => apiClient.get<Conversation>(`/chat/conversations/${id}/`).then(res => res.data),
    messages: (id: number) => apiClient.get<ChatMessage[]>(`/chat/conversations/${id}/messages/`).then(res => res.data),
    getOrCreateByObject: (objectType: string, objectId: string | number) => 
      apiClient.post<Conversation>("/chat/conversations/get_or_create_by_object/", {
        related_object_type: objectType,
        related_object_id: objectId
      }).then(res => res.data),
  },
  messages: {
    markAsRead: (id: number) => apiClient.post(`/chat/messages/${id}/mark_as_read/`).then(res => res.data),
  }
};
