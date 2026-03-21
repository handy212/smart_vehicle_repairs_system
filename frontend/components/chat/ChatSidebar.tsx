"use client";

import React, { useEffect, useState, useMemo, useRef } from "react";
import { useAuthStore } from "@/store/authStore";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils/cn";
import { formatDistanceToNow, format } from "date-fns";
import { chatApi, Conversation, ChatUser, ChatDiscoveryResponse } from "@/lib/api/chat";
import { Users, Users2, UserRound, Search, Settings, Hash, MessageSquarePlus, X, Plus, Archive } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface ChatSidebarProps {
  onSelectConversation: (conversation: Conversation) => void;
  selectedId?: number;
}

type TabType = 'staff' | 'groups' | 'clients';

export const ChatSidebar: React.FC<ChatSidebarProps> = ({ onSelectConversation, selectedId }) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [discovery, setDiscovery] = useState<ChatDiscoveryResponse>({ staff: [], clients: [] });
  const [activeTab, setActiveTab] = useState<TabType>('staff');
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [newGroupTitle, setNewGroupTitle] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<number[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const { user } = useAuthStore();

  const fetchData = async () => {
    try {
      const [convData, discoveryData] = await Promise.all([
        chatApi.conversations.list(),
        chatApi.conversations.discovery()
      ]);
      setConversations(Array.isArray(convData) ? convData : (convData as any).results || []);
      setDiscovery(discoveryData);
    } catch (error) {
      console.error("Failed to fetch chat data", error);
    }
  };

  useEffect(() => {
    if (!user) return;
    fetchData();
    pollRef.current = setInterval(fetchData, 30000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [user?.id]); // stable dep — only re-register if user changes

  const handleStartPrivateChat = async (targetUser: ChatUser) => {
    setSelectedUserId(targetUser.id);
    try {
      // More robust check: private conv where participants are exactly {me, target}
      const existing = conversations.find((c) => {
        if (c.type !== 'private') return false;
        const ids = c.memberships?.map((m) => m.user.id) ?? [];
        return ids.includes(targetUser.id) && ids.length === 2;
      });

      if (existing) {
        onSelectConversation(existing);
      } else {
        const newConv = await chatApi.conversations.create({
          type: 'private',
          participant_ids: [targetUser.id],
        });
        setConversations((prev) => [newConv, ...prev]);
        onSelectConversation(newConv);
      }
    } catch (error) {
      console.error("Failed to start private chat", error);
    }
  };

  const handleCreateGroup = async () => {
    if (!newGroupTitle.trim() || selectedMembers.length === 0) return;
    setIsLoading(true);
    try {
      const newGroup = await chatApi.conversations.create({
        title: newGroupTitle,
        type: 'group',
        participant_ids: selectedMembers,
      });
      setConversations((prev) => [newGroup, ...prev]);
      setIsCreatingGroup(false);
      setNewGroupTitle("");
      setSelectedMembers([]);
      onSelectConversation(newGroup);
    } catch (error) {
      console.error("Failed to create group", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleArchiveConversation = async (conv: Conversation, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await chatApi.conversations.archive(conv.id);
      setConversations((prev) => prev.filter((c) => c.id !== conv.id));
    } catch {
      // Non-admin: silently ignore
    }
  };

  const filteredStaff = useMemo(() =>
    discovery.staff.filter((u) => u.full_name.toLowerCase().includes(searchQuery.toLowerCase())),
    [discovery.staff, searchQuery]
  );

  const filteredClients = useMemo(() =>
    discovery.clients.filter((u) => u.full_name.toLowerCase().includes(searchQuery.toLowerCase())),
    [discovery.clients, searchQuery]
  );

  const filteredGroups = useMemo(() =>
    conversations.filter(
      (c) => c.type === 'group' && (c.title?.toLowerCase().includes(searchQuery.toLowerCase()))
    ),
    [conversations, searchQuery]
  );

  // Build a map from userId → private conversation for badge counts
  const privateConvByUser = useMemo(() => {
    const map = new Map<number, Conversation>();
    conversations.forEach((c) => {
      if (c.type !== 'private') return;
      c.memberships?.forEach((m) => {
        if (m.user.id !== user?.id) map.set(m.user.id, c);
      });
    });
    return map;
  }, [conversations, user?.id]);

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900 border-r border-border overflow-hidden relative">
      <AnimatePresence>
        {isCreatingGroup && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute inset-0 z-50 bg-white dark:bg-slate-900 flex flex-col p-6 shadow-2xl"
          >
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-xl font-black tracking-tight flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                New Team
              </h2>
              <button onClick={() => setIsCreatingGroup(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-6 flex-1 overflow-hidden flex flex-col">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Team Name</label>
                <input
                  type="text"
                  value={newGroupTitle}
                  onChange={(e) => setNewGroupTitle(e.target.value)}
                  placeholder="e.g. Engine Repair Squad"
                  className="w-full p-4 bg-slate-50 dark:bg-slate-950 border border-border rounded-2xl outline-none focus:ring-2 ring-primary/20 transition-all font-bold"
                />
              </div>

              <div className="flex-1 overflow-hidden flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">
                  Select Members ({selectedMembers.length} selected)
                </label>
                <ScrollArea className="flex-1 border rounded-2xl bg-white dark:bg-slate-950">
                  <div className="p-2">
                    {[...discovery.staff, ...discovery.clients].map((u) => (
                      <div
                        key={u.id}
                        onClick={() => {
                          setSelectedMembers((prev) =>
                            prev.includes(u.id) ? prev.filter((id) => id !== u.id) : [...prev, u.id]
                          );
                        }}
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all mb-1",
                          selectedMembers.includes(u.id)
                            ? "bg-primary/5 border border-primary/20"
                            : "hover:bg-slate-50 dark:hover:bg-slate-800 border border-transparent"
                        )}
                      >
                        <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-xs overflow-hidden">
                          {u.avatar_url
                            ? <img src={u.avatar_url} alt="" className="w-full h-full object-cover" />
                            : u.full_name?.charAt(0)}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-bold">{u.full_name}</p>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-tight">{u.role}</p>
                        </div>
                        {selectedMembers.includes(u.id) && (
                          <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center text-white">
                            <Plus className="w-3 h-3 rotate-45" />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              <button
                onClick={handleCreateGroup}
                disabled={!newGroupTitle.trim() || selectedMembers.length === 0 || isLoading}
                className="w-full py-4 bg-primary text-white font-black uppercase tracking-widest rounded-2xl shadow-xl hover:scale-[1.02] transition-all active:scale-95 disabled:opacity-30 disabled:hover:scale-100"
              >
                {isLoading ? "Creating..." : "Create Collective Chat"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Header Profile */}
      <div className="p-4 py-5 border-b bg-white dark:bg-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-bold text-slate-500 overflow-hidden border border-border shadow-sm">
            {user?.profile_picture
              ? <img src={user.profile_picture as string} alt="" className="w-full h-full object-cover" />
              : user?.first_name?.charAt(0)}
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-sm tracking-tight truncate max-w-[140px] leading-tight">{user?.first_name} {user?.last_name}</span>
            <span className="text-[10px] text-muted-foreground font-black uppercase tracking-widest leading-none mt-0.5">{user?.role}</span>
          </div>
        </div>
        <button className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 group transition-all active:scale-90">
          <Settings className="w-4 h-4 group-hover:rotate-45 transition-transform" />
        </button>
      </div>

      {/* Search & Actions */}
      <div className="p-4 space-y-4">
        <div className="flex gap-2">
          <div className="relative flex-1 group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
            <input
              type="text"
              placeholder={`Search ${activeTab}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-white dark:bg-slate-950 border border-border rounded-xl outline-none focus:ring-2 ring-primary/20 transition-all text-sm font-medium"
            />
          </div>
          <button
            onClick={() => setIsCreatingGroup(true)}
            title="New Group Chat"
            className="w-10 h-10 rounded-xl bg-white dark:bg-slate-950 border border-border text-primary hover:bg-primary hover:text-white transition-all shadow-sm flex items-center justify-center active:scale-90"
          >
            <MessageSquarePlus className="w-4 h-4" />
          </button>
        </div>

        {/* 3-Tab Layout */}
        <div className="flex p-1 bg-white dark:bg-slate-950 rounded-xl border border-border shadow-sm">
          <TabButton active={activeTab === 'staff'} onClick={() => setActiveTab('staff')} icon={<Users2 className="w-3.5 h-3.5" />} label="Staff" />
          <TabButton active={activeTab === 'groups'} onClick={() => setActiveTab('groups')} icon={<Users className="w-3.5 h-3.5" />} label="Groups" />
          <TabButton active={activeTab === 'clients'} onClick={() => setActiveTab('clients')} icon={<UserRound className="w-3.5 h-3.5" />} label="Clients" />
        </div>
      </div>

      <ScrollArea className="flex-1 px-4">
        <div className="space-y-1">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, x: -5 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 5 }}
              transition={{ duration: 0.15 }}
            >
              {activeTab === 'staff' && (
                filteredStaff.length > 0
                  ? filteredStaff.map((u) => (
                    <UserItem
                      key={u.id}
                      user={u}
                      isSelected={selectedUserId === u.id && selectedId === privateConvByUser.get(u.id)?.id}
                      unreadCount={privateConvByUser.get(u.id)?.unread_count ?? 0}
                      onClick={() => handleStartPrivateChat(u)}
                    />
                  ))
                  : <EmptyText tab="staff" />
              )}

              {activeTab === 'clients' && (
                filteredClients.length > 0
                  ? filteredClients.map((u) => (
                    <UserItem
                      key={u.id}
                      user={u}
                      isSelected={selectedUserId === u.id && selectedId === privateConvByUser.get(u.id)?.id}
                      unreadCount={privateConvByUser.get(u.id)?.unread_count ?? 0}
                      onClick={() => handleStartPrivateChat(u)}
                    />
                  ))
                  : <EmptyText tab="clients" />
              )}

              {activeTab === 'groups' && (
                filteredGroups.length > 0
                  ? filteredGroups.map((g) => (
                    <GroupItem
                      key={g.id}
                      group={g}
                      active={selectedId === g.id}
                      onClick={() => onSelectConversation(g)}
                      onArchive={(e) => handleArchiveConversation(g, e)}
                    />
                  ))
                  : <EmptyText tab="groups" />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </ScrollArea>
    </div>
  );
};

const TabButton = ({ active, onClick, icon, label }: any) => (
  <button
    onClick={onClick}
    className={cn(
      "flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[10px] font-black uppercase tracking-[0.15em] rounded-lg transition-all",
      active ? "bg-primary shadow-lg shadow-primary/20 text-white" : "text-muted-foreground hover:bg-slate-50 dark:hover:bg-slate-800 active:scale-95"
    )}
  >
    {icon}
    {label}
  </button>
);

const UserItem = ({
  user,
  onClick,
  isSelected,
  unreadCount,
}: {
  user: ChatUser;
  onClick: () => void;
  isSelected: boolean;
  unreadCount: number;
}) => {
  const isOnline = user.is_online;
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full p-3 rounded-2xl hover:bg-white dark:hover:bg-slate-800 transition-all flex items-center gap-3 group text-left mb-1 active:scale-[0.98]",
        isSelected && "bg-white dark:bg-slate-800 shadow-sm border border-border"
      )}
    >
      <div className="relative">
        <div className="w-11 h-11 rounded-2xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center font-bold text-xs text-slate-500 overflow-hidden border border-border group-hover:border-primary/50 transition-colors">
          {user.avatar_url
            ? <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
            : user.full_name?.charAt(0)}
        </div>
        {isOnline && (
          <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-success rounded-full border-2 border-white dark:border-slate-900 shadow-sm" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-baseline mb-0.5">
          <p className={cn("text-sm font-bold truncate group-hover:text-primary transition-colors tracking-tight", isSelected && "text-primary")}>
            {user.full_name}
          </p>
          {unreadCount > 0 && (
            <span className="ml-2 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-white text-[10px] font-black flex items-center justify-center">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest flex items-center gap-2">
          {user.role.replace('_', ' ')}
          {!isOnline && user.last_seen && (
            <span className="normal-case font-medium lowercase flex items-center gap-1">
              <span className="w-1 h-1 rounded-full bg-slate-300" />
              {formatDistanceToNow(new Date(user.last_seen), { addSuffix: true }).replace('about ', '')}
            </span>
          )}
        </p>
      </div>
    </button>
  );
};

const GroupItem = ({
  group,
  active,
  onClick,
  onArchive,
}: {
  group: Conversation;
  active: boolean;
  onClick: () => void;
  onArchive: (e: React.MouseEvent) => void;
}) => (
  <button
    onClick={onClick}
    className={cn(
      "w-full p-3 rounded-2xl transition-all flex items-center gap-3 text-left group mb-1 active:scale-[0.98] relative",
      active ? "bg-white dark:bg-slate-800 shadow-sm border border-border" : "hover:bg-white dark:hover:bg-slate-800"
    )}
  >
    <div className={cn(
      "w-11 h-11 rounded-2xl flex items-center justify-center transition-all shrink-0",
      active ? "bg-primary text-white shadow-lg shadow-primary/20" : "bg-slate-100 dark:bg-slate-950 text-slate-400 group-hover:text-primary border border-border"
    )}>
      <Hash className="w-5 h-5" />
    </div>
    <div className="flex-1 min-w-0">
      <div className="flex justify-between items-baseline mb-0.5">
        <p className={cn("text-sm font-bold truncate tracking-tight transition-colors", active ? "text-primary" : "")}>
          {group.title || "Untitled Group"}
        </p>
        <div className="flex items-center gap-1.5 ml-1 shrink-0">
          {group.unread_count > 0 && (
            <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-white text-[10px] font-black flex items-center justify-center">
              {group.unread_count > 99 ? '99+' : group.unread_count}
            </span>
          )}
          {group.last_message && (
            <span className="text-[9px] font-bold text-muted-foreground/50">
              {format(new Date(group.last_message.timestamp), "HH:mm")}
            </span>
          )}
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground font-medium truncate">
        {group.last_message ? group.last_message.message : `${group.memberships?.length || 0} members`}
      </p>
    </div>
    {/* Archive button — only visible on hover */}
    <button
      onClick={onArchive}
      title="Archive"
      className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-muted-foreground hover:text-destructive transition-all"
    >
      <Archive className="w-3.5 h-3.5" />
    </button>
  </button>
);

const EmptyText = ({ tab }: { tab: string }) => (
  <div className="py-20 flex flex-col items-center justify-center text-center">
    <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-300 mb-4 opacity-50">
      <Search className="w-6 h-6" />
    </div>
    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/50">No {tab} found</p>
  </div>
);
