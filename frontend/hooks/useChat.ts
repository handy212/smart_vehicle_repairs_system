"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuthStore } from "@/store/authStore";

interface Message {
  id: number;
  message: string;
  sender_email: string;
  sender_id: number;
  timestamp: string;
}

export const useChat = (conversationId: string | number | null) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const { user } = useAuthStore();

  useEffect(() => {
    if (!conversationId || !user) return;

    // Use location.hostname for WebSocket connection
    const wsUrl = `ws://${window.location.host}/ws/chat/${conversationId}/`;
    socketRef.current = new WebSocket(wsUrl);

    socketRef.current.onopen = () => {
      console.log("WebSocket Connected");
      setIsConnected(true);
    };

    socketRef.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "chat_message") {
        setMessages((prev) => [...prev, {
          id: data.id,
          message: data.message,
          sender_email: data.sender_email,
          sender_id: data.sender_id,
          timestamp: data.timestamp
        }]);
      }
    };

    socketRef.current.onclose = () => {
      console.log("WebSocket Disconnected");
      setIsConnected(false);
    };

    return () => {
      socketRef.current?.close();
    };
  }, [conversationId, user]);

  const sendMessage = useCallback((message: string) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ message }));
    }
  }, []);

  return {
    messages,
    setMessages,
    sendMessage,
    isConnected
  };
};
