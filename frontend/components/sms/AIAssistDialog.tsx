'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, Send, X, Copy, Check, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useMutation } from '@tanstack/react-query';
import smsApi from '@/services/sms';
import { useToast } from '@/lib/hooks/useToast';
import { getUserFacingError } from '@/lib/api/errors';
import { isAxiosError } from 'axios';

interface Message {
    role: 'user' | 'model';
    content: string;
    suggestion?: string | null;
}

interface AIAssistDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    currentDraft?: string;
    mode?: 'sms' | 'template';
    onUseSuggestion: (text: string) => void;
}

const STARTER_PROMPTS = [
    'Write an appointment reminder for tomorrow',
    'Vehicle ready for pickup — keep it short',
    'Send an invoice payment reminder',
    'Follow up on a service estimate',
    'Notify about a parts delay',
];

export function AIAssistDialog({
    open,
    onOpenChange,
    currentDraft = '',
    mode = 'sms',
    onUseSuggestion,
}: AIAssistDialogProps) {
    const { toast } = useToast();
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
    const scrollRef = useRef<React.ElementRef<typeof ScrollArea>>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    // Scroll to bottom when new messages arrive
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    // Focus input when dialog opens
    useEffect(() => {
        if (open) {
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [open]);

    const chatMutation = useMutation({
        mutationFn: (userMessage: string) => {
            const newMessages: Message[] = [...messages, { role: 'user', content: userMessage }];
            return smsApi.aiChat({
                messages: newMessages.map(m => ({ role: m.role, content: m.content })),
                current_draft: currentDraft,
                mode,
            }).then(res => ({ res, userMessage }));
        },
        onSuccess: ({ res, userMessage }) => {
            setMessages(prev => [
                ...prev,
                { role: 'user', content: userMessage },
                { role: 'model', content: res.reply, suggestion: res.suggestion },
            ]);
        },
        onError: (err: unknown) => {
            const httpStatus = isAxiosError(err) ? err.response?.status : undefined;
            const description = httpStatus === 429
                ? 'AI quota exceeded — please try again in a moment.'
                : getUserFacingError(err, 'Failed to get AI response.');
            toast({ title: 'AI Error', description, variant: 'destructive' });
        },
    });

    const handleSend = () => {
        const text = input.trim();
        if (!text || chatMutation.isPending) return;
        setInput('');
        chatMutation.mutate(text);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleCopy = (text: string, idx: number) => {
        navigator.clipboard.writeText(text);
        setCopiedIndex(idx);
        setTimeout(() => setCopiedIndex(null), 2000);
    };

    const handleReset = () => {
        setMessages([]);
        setInput('');
    };

    // Render model reply: strip [SMS]...[/SMS] tags from display text
    const renderReply = (content: string) => {
        return content.replace(/\[SMS\](.*?)\[\/SMS\]/gs, '$1');
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg w-full p-0 gap-0 rounded-lg overflow-hidden flex flex-col h-[calc(100vh-1.5rem)] sm:h-[620px]">
                <DialogHeader className="px-5 py-4 border-b bg-gradient-to-r from-primary/5 to-primary/10 flex-shrink-0">
                    <div className="flex items-center justify-between">
                        <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
                            <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
                                <Sparkles className="h-4 w-4 text-primary" />
                            </div>
                            SMS Assistant
                        </DialogTitle>
                        <div className="flex items-center gap-1">
                            {messages.length > 0 && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground"
                                    onClick={handleReset}
                                    title="Start new conversation"
                                >
                                    <RefreshCw className="h-3.5 w-3.5" />
                                </Button>
                            )}
                        </div>
                    </div>
                </DialogHeader>

                {/* Messages area */}
                <ScrollArea className="flex-1 min-h-0" ref={scrollRef}>
                    <div className="px-4 py-4 space-y-4">
                        {messages.length === 0 && (
                            <div className="space-y-4 py-2">
                                <p className="text-[11px] text-center text-muted-foreground uppercase tracking-wider font-semibold">
                                    Try a starter prompt
                                </p>
                                <div className="flex flex-wrap gap-2 justify-center">
                                    {STARTER_PROMPTS.map(p => (
                                        <button
                                            key={p}
                                            onClick={() => {
                                                setInput(p);
                                                inputRef.current?.focus();
                                            }}
                                            className="text-xs px-3 py-1.5 rounded-full border border-border bg-muted/40 hover:bg-muted/80 hover:border-primary/40 transition-colors text-foreground"
                                        >
                                            {p}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {messages.map((msg, idx) => (
                            <div
                                key={idx}
                                className={cn(
                                    'flex',
                                    msg.role === 'user' ? 'justify-end' : 'justify-start'
                                )}
                            >
                                {msg.role === 'user' ? (
                                    <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-primary text-primary-foreground px-4 py-2.5 text-sm">
                                        {msg.content}
                                    </div>
                                ) : (
                                    <div className="max-w-[92%] space-y-2">
                                        <div className="rounded-2xl rounded-tl-sm bg-muted/60 border border-border px-4 py-3 text-sm text-foreground whitespace-pre-wrap">
                                            {renderReply(msg.content)}
                                        </div>
                                        {msg.suggestion && (
                                            <div className="rounded-xl border-2 border-primary/20 bg-primary/5 px-4 py-3 space-y-2">
                                                <p className="text-[10px] font-bold text-primary uppercase tracking-wider">Suggested SMS</p>
                                                <p className="text-sm text-foreground font-medium">{msg.suggestion}</p>
                                                <div className="flex items-center gap-2 pt-1">
                                                    <Button
                                                        size="sm"
                                                        className="h-7 px-3 text-xs rounded-lg"
                                                        onClick={() => {
                                                            onUseSuggestion(msg.suggestion!);
                                                            onOpenChange(false);
                                                        }}
                                                    >
                                                        Use this
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="h-7 px-2 text-xs rounded-lg text-muted-foreground"
                                                        onClick={() => handleCopy(msg.suggestion!, idx)}
                                                    >
                                                        {copiedIndex === idx ? (
                                                            <Check className="h-3 w-3 text-success" />
                                                        ) : (
                                                            <Copy className="h-3 w-3" />
                                                        )}
                                                    </Button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}

                        {chatMutation.isPending && (
                            <div className="flex justify-start">
                                <div className="rounded-2xl rounded-tl-sm bg-muted/60 border border-border px-4 py-3">
                                    <div className="flex items-center gap-1.5">
                                        <span className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce [animation-delay:0ms]" />
                                        <span className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce [animation-delay:150ms]" />
                                        <span className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce [animation-delay:300ms]" />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </ScrollArea>

                {/* Input area */}
                <div className="flex-shrink-0 border-t bg-background px-4 py-3">
                    {currentDraft && messages.length === 0 && (
                        <div className="mb-2 flex items-center gap-2 text-[11px] text-muted-foreground bg-muted/40 rounded-lg px-3 py-1.5">
                            <span className="font-semibold text-foreground/70">Current draft:</span>
                            <span className="truncate italic">{currentDraft}</span>
                            <X
                                className="h-3 w-3 ml-auto flex-shrink-0 cursor-pointer hover:text-foreground"
                                onClick={() => onUseSuggestion('')}
                            />
                        </div>
                    )}
                    <div className="flex items-end gap-2">
                        <Textarea
                            ref={inputRef}
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Describe the SMS you need..."
                            className="min-h-[44px] max-h-[120px] resize-none text-sm rounded-xl bg-muted/20 border-muted/60 focus:border-primary/40 py-2.5"
                            disabled={chatMutation.isPending}
                            rows={1}
                        />
                        <Button
                            size="icon"
                            className="h-11 w-11 rounded-xl flex-shrink-0 bg-primary hover:bg-primary/90"
                            onClick={handleSend}
                            disabled={!input.trim() || chatMutation.isPending}
                        >
                            {chatMutation.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <Send className="h-4 w-4" />
                            )}
                        </Button>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
                        Press Enter to send · Shift+Enter for new line
                    </p>
                </div>
            </DialogContent>
        </Dialog>
    );
}
