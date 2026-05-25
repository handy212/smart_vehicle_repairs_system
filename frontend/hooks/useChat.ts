"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuthStore } from "@/store/authStore";
import { ChatMessage } from "@/lib/api/chat";
import { getAccessToken } from "@/lib/utils/token";

const RECONNECT_BASE_DELAY = 1000; // 1s
const RECONNECT_MAX_DELAY = 30000; // 30s
const TYPING_STALE_TIMEOUT = 5000; // clear a user's typing indicator after 5s of no event

export const useChat = (conversationId: string | number | null) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [typingUsers, setTypingUsers] = useState<{ id: number; name: string }[]>([]);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectDelayRef = useRef(RECONNECT_BASE_DELAY);
  const typingTimeoutsRef = useRef<Map<number, NodeJS.Timeout>>(new Map());
  const isMountedRef = useRef(true);

  const { user } = useAuthStore();

  const getWsUrl = useCallback(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
    let host = window.location.host;

    if (apiUrl) {
      try {
        const url = new URL(apiUrl);
        host = url.host;
      } catch (e) {
        console.warn("Invalid NEXT_PUBLIC_API_URL for WebSocket derivation", e);
      }
    }

    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${wsProtocol}//${host}/ws/chat/${conversationId}/`;
  }, [conversationId]);

  const connect = useCallback(() => {
    if (!conversationId || !user || !isMountedRef.current) return;

    const wsUrl = getWsUrl();
    const token = getAccessToken();
    // Prefer cookie auth on same host; fall back to query token for cross-origin dev
    const finalUrl = token ? `${wsUrl}?token=${encodeURIComponent(token)}` : wsUrl;

    const socket = new WebSocket(finalUrl);
    socketRef.current = socket;

    socket.onopen = () => {
      if (!isMountedRef.current) return;
      console.log(`[Chat] WebSocket connected (conv ${conversationId})`);
      setIsConnected(true);
      reconnectDelayRef.current = RECONNECT_BASE_DELAY; // reset backoff
    };

    socket.onmessage = (event) => {
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(event.data);
      } catch {
        console.error("[Chat] Received invalid JSON from WebSocket");
        return;
      }

      switch (data.type) {
        case "chat.message":
          setMessages((prev) => {
            // Deduplicate by id in case a page refresh and a WS event both add the same message
            if (prev.some((m) => m.id === (data.id as number))) return prev;
            return [...prev, data as unknown as ChatMessage];
          });
          break;

        case "chat.typing": {
          const userId = data.user_id as number;
          const userName = data.user_name as string;
          if (userId === user.id) break;

          if (data.is_typing) {
            setTypingUsers((prev) => {
              if (prev.some((u) => u.id === userId)) return prev;
              return [...prev, { id: userId, name: userName }];
            });
            // Stale typing guard — remove this user after 5s of silence
            const existing = typingTimeoutsRef.current.get(userId);
            if (existing) clearTimeout(existing);
            const t = setTimeout(() => {
              setTypingUsers((prev) => prev.filter((u) => u.id !== userId));
              typingTimeoutsRef.current.delete(userId);
            }, TYPING_STALE_TIMEOUT);
            typingTimeoutsRef.current.set(userId, t);
          } else {
            const existing = typingTimeoutsRef.current.get(userId);
            if (existing) { clearTimeout(existing); typingTimeoutsRef.current.delete(userId); }
            setTypingUsers((prev) => prev.filter((u) => u.id !== userId));
          }
          break;
        }

        case "chat.read_receipt":
          setMessages((prev) =>
            prev.map((m) =>
              m.id === (data.message_id as number) ? { ...m, is_read: true } : m
            )
          );
          break;

        case "chat.presence":
          // Presence updates are handled by re-fetching discovery in ChatSidebar;
          // nothing to do here for now.
          break;

        case "chat.error":
          console.error("[Chat] Server error:", data.error);
          break;
      }
    };

    socket.onerror = () => {
      // Browser WebSocket onerror events are intentionally opaque (no details exposed).
      // The real close reason and code will arrive in onclose immediately after this.
      console.warn(`[Chat] WebSocket connection error (conv ${conversationId}). See onclose for details.`);
      setIsConnected(false);
    };

    socket.onclose = (event) => {
      if (!isMountedRef.current) return;
      console.log(`[Chat] WebSocket closed (code ${event.code})`);
      setIsConnected(false);
      socketRef.current = null;

      // Don't reconnect if the server explicitly refused (auth failure)
      if (event.code === 4001 || event.code === 4003) {
        console.warn("[Chat] Connection rejected by server — not reconnecting.");
        return;
      }

      // Exponential backoff reconnect
      const delay = reconnectDelayRef.current;
      reconnectDelayRef.current = Math.min(delay * 2, RECONNECT_MAX_DELAY);
      reconnectTimeoutRef.current = setTimeout(connect, delay);
    };
  }, [conversationId, user, getWsUrl]);

  useEffect(() => {
    isMountedRef.current = true;

    if (!conversationId || !user) return;

    connect();

    return () => {
      isMountedRef.current = false;

      // Clear reconnect timer
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);

      // Clear stale typing timers
      typingTimeoutsRef.current.forEach((t) => clearTimeout(t));
      typingTimeoutsRef.current.clear();

      // Close the socket cleanly
      if (socketRef.current) {
        socketRef.current.onclose = null; // prevent reconnect on intentional unmount
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [conversationId, user, connect]);

  const sendMessage = useCallback(
    (
      message: string,
      type: 'text' | 'image' | 'file' = 'text',
      metadata: Record<string, unknown> = {},
      parentMessageId?: number
    ) => {
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(
          JSON.stringify({
            type: 'chat_message',
            message,
            message_type: type,
            metadata,
            ...(parentMessageId && { parent_message_id: parentMessageId }),
          })
        );
      }
    },
    []
  );

  const sendTyping = useCallback((isTyping: boolean) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'typing', is_typing: isTyping }));
    }
  }, []);

  const sendReadReceipt = useCallback((messageId: number) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({ type: 'read_receipt', message_id: messageId })
      );
    }
  }, []);

  return {
    messages,
    setMessages,
    sendMessage,
    sendTyping,
    sendReadReceipt,
    typingUsers,
    isConnected,
  };
};
