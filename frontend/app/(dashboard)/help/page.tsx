"use client";

import { useState } from "react";
import { Search, Mail, BookOpen, ChevronRight, ExternalLink, ArrowLeft, LayoutDashboard } from "lucide-react";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { helpContent, type HelpModule } from "@/lib/help-data";
import { useRouter } from "next/navigation";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { cn } from "@/lib/utils/cn";

export default function HelpPage() {
    const [searchQuery, setSearchQuery] = useState("");
    const [activeModuleId, setActiveModuleId] = useState<string | null>(null);
    const router = useRouter();

    // Filter logic
    const getFilteredContent = () => {
        if (!searchQuery) return helpContent;

        const filtered: Record<string, HelpModule> = {};
        Object.entries(helpContent).forEach(([key, module]) => {
            const matchingTopics = module.topics.filter(
                (topic) =>
                    topic.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    topic.steps.some((step) => step.toLowerCase().includes(searchQuery.toLowerCase())) ||
                    module.title.toLowerCase().includes(searchQuery.toLowerCase())
            );
            if (matchingTopics.length > 0) {
                filtered[key] = {
                    ...module,
                    topics: matchingTopics,
                };
            }
        });
        return filtered;
    };

    const filteredContent = getFilteredContent();
    const modulesArray = Object.values(filteredContent);
    const hasResults = modulesArray.length > 0;

    // Determine what to show in the main area
    const activeModule = activeModuleId ? filteredContent[activeModuleId] : null;

    // Reset view if search yields no results for current selection
    if (activeModuleId && !activeModule && hasResults) {
        // Find another one or show home
    }

    return (
        <div className="container max-w-7xl mx-auto p-4 md:p-6 lg:p-8 h-[calc(100vh-5rem)] flex flex-col gap-4 md:gap-6">

            {/* Header Area - More Compact */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0 bg-card p-4 rounded-xl border border-border/50 shadow-sm">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10 text-primary">
                        <BookOpen className="w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="text-xl md:text-2xl font-bold text-foreground">Help Center</h1>
                        <p className="text-xs text-muted-foreground">Documentation and guides for Smart Vehicle Repairs</p>
                    </div>
                </div>
                <div className="relative w-full md:w-80 lg:w-96">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        type="text"
                        placeholder="Search documentation..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 h-10 bg-muted/30 border-border/50 focus:bg-background transition-all"
                    />
                </div>
            </div>

            {/* Main Content Area */}
            {hasResults ? (
                <div className="flex flex-1 gap-4 md:gap-6 overflow-hidden min-h-0">

                    {/* Left Sidebar - Always visible on desktop */}
                    <aside className="w-64 shrink-0 hidden md:flex flex-col bg-card rounded-xl border border-border/50 shadow-sm overflow-hidden">
                        <div className="p-4 border-b bg-muted/10">
                            <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Explore Modules</h2>
                        </div>
                        <ScrollArea className="flex-1">
                            <div className="p-2 space-y-0.5">
                                <button
                                    onClick={() => setActiveModuleId(null)}
                                    className={cn(
                                        "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                                        !activeModuleId ? "bg-primary text-primary-foreground shadow-md" : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                                    )}
                                >
                                    <LayoutDashboard className="w-4 h-4" />
                                    All Modules
                                </button>
                                <div className="h-px bg-border my-2" />
                                {modulesArray.map((module) => {
                                    const Icon = module.icon;
                                    const isActive = activeModuleId === module.id;
                                    return (
                                        <button
                                            key={module.id}
                                            onClick={() => setActiveModuleId(module.id)}
                                            className={cn(
                                                "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                                                isActive ? "bg-primary/10 text-primary border-l-2 border-primary rounded-l-none" : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                                            )}
                                        >
                                            <Icon className={cn("w-4 h-4", isActive ? "text-primary" : "text-muted-foreground")} />
                                            <span className="truncate">{module.title}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </ScrollArea>
                        <div className="p-4 border-t bg-muted/5 mt-auto">
                            <a href="mailto:support@smartrepairs.com" className="flex items-center justify-center gap-2 py-2 px-3 rounded-lg border border-border/50 bg-muted/20 text-xs text-muted-foreground hover:text-primary hover:bg-primary/5 transition-all">
                                <Mail className="w-3.5 h-3.5" />
                                Support Ticket
                            </a>
                        </div>
                    </aside>

                    {/* Center Content Area */}
                    <main className="flex-1 min-w-0 bg-card rounded-xl border border-border/50 shadow-sm overflow-hidden flex flex-col">
                        <ScrollArea className="flex-1">
                            {activeModule ? (
                                <div className="p-6 md:p-8">
                                    {/* Mobile Back Button */}
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setActiveModuleId(null)}
                                        className="md:hidden mb-4 -ml-2 text-muted-foreground"
                                    >
                                        <ArrowLeft className="w-4 h-4 mr-2" />
                                        Back to All
                                    </Button>

                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                                        <div className="flex items-center gap-4">
                                            <div className="p-3 rounded-xl bg-primary/10 text-primary shrink-0 ring-1 ring-primary/20 shadow-sm">
                                                <activeModule.icon className="w-6 h-6 md:w-8 md:h-8" />
                                            </div>
                                            <div>
                                                <h2 className="text-xl md:text-2xl font-bold text-foreground tracking-tight">{activeModule.title}</h2>
                                                <p className="text-sm text-muted-foreground font-medium">{activeModule.description}</p>
                                            </div>
                                        </div>
                                    </div>

                                    <Accordion type="single" collapsible className="space-y-4">
                                        {activeModule.topics.map((topic, idx) => (
                                            <AccordionItem key={idx} value={`item-${idx}`} className="border rounded-xl px-4 md:px-6 bg-muted/5 hover:bg-muted/10 transition-colors border-border/50">
                                                <AccordionTrigger className="hover:no-underline py-4 text-base font-semibold group">
                                                    <span className="text-left group-data-[state=open]:text-primary transition-colors">
                                                        {topic.title}
                                                    </span>
                                                </AccordionTrigger>
                                                <AccordionContent className="pb-6">
                                                    <div className="pt-2 space-y-6">
                                                        <ol className="relative border-l border-primary/20 ml-3 space-y-6">
                                                            {topic.steps.map((step, stepIdx) => (
                                                                <li key={stepIdx} className="ml-8 relative">
                                                                    <span className="absolute flex items-center justify-center w-6 h-6 bg-primary/10 text-primary border border-primary/20 rounded-full -left-[45px] top-0 text-[10px] font-bold shadow-sm">
                                                                        {stepIdx + 1}
                                                                    </span>
                                                                    <p className="text-sm text-foreground/80 leading-relaxed font-medium pt-0.5">{step}</p>
                                                                </li>
                                                            ))}
                                                        </ol>

                                                        {topic.actionLink && (
                                                            <div className="flex items-center gap-4 pl-8">
                                                                <Button
                                                                    size="sm"
                                                                    className="gap-2 h-9 px-4 shadow-sm"
                                                                    onClick={() => router.push(topic.actionLink!)}
                                                                >
                                                                    {topic.actionLabel || "Open Module"}
                                                                    <ExternalLink className="w-3.5 h-3.5" />
                                                                </Button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </AccordionContent>
                                            </AccordionItem>
                                        ))}
                                    </Accordion>
                                </div>
                            ) : (
                                <div className="p-6 md:p-8">
                                    <div className="mb-6">
                                        <h2 className="text-lg font-bold text-foreground">Browse Modules</h2>
                                        <p className="text-sm text-muted-foreground">Select a category below to view detailed guides</p>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {modulesArray.map((module) => (
                                            <Card
                                                key={module.id}
                                                className="group hover:border-primary/50 hover:bg-primary/5 cursor-pointer transition-all duration-300 border-border/50 shadow-none border-dashed"
                                                onClick={() => setActiveModuleId(module.id)}
                                            >
                                                <CardContent className="p-5 flex flex-col gap-3">
                                                    <div className="p-2.5 rounded-lg bg-muted group-hover:bg-primary/10 text-muted-foreground group-hover:text-primary w-fit transition-colors">
                                                        <module.icon className="w-5 h-5" />
                                                    </div>
                                                    <div>
                                                        <h3 className="font-bold text-sm text-foreground group-hover:text-primary transition-colors">{module.title}</h3>
                                                        <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{module.description}</p>
                                                    </div>
                                                    <div className="flex items-center text-[10px] font-bold text-primary opacity-0 group-hover:opacity-100 transition-opacity mt-1 uppercase tracking-widest">
                                                        View Details <ChevronRight className="w-3 h-3 ml-1" />
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </ScrollArea>
                    </main>
                </div>
            ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-12 border border-dashed rounded-2xl bg-card">
                    <div className="bg-muted/50 p-4 rounded-full mb-4">
                        <Search className="w-8 h-8 text-muted-foreground/30" />
                    </div>
                    <h3 className="text-lg font-bold text-foreground">No results found</h3>
                    <p className="text-sm text-muted-foreground max-w-sm mt-2">
                        We couldn't find any help topics matching "{searchQuery}".
                    </p>
                    <Button
                        variant="outline"
                        className="mt-6"
                        onClick={() => setSearchQuery("")}
                    >
                        Clear Search
                    </Button>
                </div>
            )}
        </div>
    );
}

