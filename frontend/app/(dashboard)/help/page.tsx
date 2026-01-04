"use client";

import { useState } from "react";
import { Search, Mail, BookOpen, ChevronRight, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { helpContent, type HelpModule } from "@/lib/help-data";
import { useRouter } from "next/navigation";

export default function HelpPage() {
    const [searchQuery, setSearchQuery] = useState("");
    const [activeModuleId, setActiveModuleId] = useState("accounting"); // Default to Accounting
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
    const hasResults = Object.keys(filteredContent).length > 0;

    // Derived active module (fallback if filter hides current selection)
    const activeModule = filteredContent[activeModuleId]
        ? filteredContent[activeModuleId]
        : Object.values(filteredContent)[0];

    return (
        <div className="container max-w-7xl mx-auto p-6 md:p-8 h-[calc(100vh-4rem)] flex flex-col gap-6">

            {/* Header Area */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-3">
                        <BookOpen className="w-8 h-8 text-primary" />
                        Help Center
                    </h1>
                    <p className="text-muted-foreground mt-1">Documentation and guides for smart Vehicle Repairs</p>
                </div>
                <div className="relative w-full md:w-96">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                        type="text"
                        placeholder="Search documentation..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 h-10 bg-background"
                    />
                </div>
            </div>

            {/* Main Content Area */}
            {hasResults ? (
                <div className="flex flex-1 gap-6 overflow-hidden rounded-xl border bg-card shadow-sm">

                    {/* Sidebar Navigation */}
                    <aside className="w-64 border-r hidden md:flex flex-col bg-muted/10">
                        <div className="p-4 font-semibold text-sm text-muted-foreground uppercase tracking-wider">
                            Modules
                        </div>
                        <ScrollArea className="flex-1">
                            <div className="px-3 pb-4 space-y-1">
                                {Object.values(filteredContent).map((module) => {
                                    const Icon = module.icon;
                                    const isActive = activeModule && activeModule.id === module.id;
                                    return (
                                        <button
                                            key={module.id}
                                            onClick={() => setActiveModuleId(module.id)}
                                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${isActive
                                                    ? "bg-primary/10 text-primary"
                                                    : "text-gray-600 dark:text-gray-400 hover:bg-muted hover:text-foreground"
                                                }`}
                                        >
                                            <Icon className={`w-4 h-4 ${isActive ? "text-primary" : "text-gray-500"}`} />
                                            {module.title}
                                            {isActive && <ChevronRight className="w-4 h-4 ml-auto opacity-50" />}
                                        </button>
                                    );
                                })}
                            </div>
                        </ScrollArea>

                        {/* Compact Support Link in Sidebar Footer */}
                        <div className="p-4 border-t bg-muted/20">
                            <a href="mailto:support@smartrepairs.com" className="flex items-center gap-2 text-xs text-muted-foreground hover:text-primary transition-colors">
                                <Mail className="w-3 h-3" />
                                Contact Support
                            </a>
                        </div>
                    </aside>

                    {/* Content Area */}
                    <main className="flex-1 flex flex-col min-w-0 bg-background">
                        {activeModule ? (
                            <ScrollArea className="flex-1 h-full">
                                <div className="p-6 md:p-8 max-w-4xl">
                                    <div className="flex items-start gap-4 mb-6">
                                        <div className="p-3 rounded-xl bg-primary/10 text-primary">
                                            <activeModule.icon className="w-8 h-8" />
                                        </div>
                                        <div>
                                            <h2 className="text-2xl font-bold text-foreground">{activeModule.title}</h2>
                                            <p className="text-muted-foreground">{activeModule.description}</p>
                                        </div>
                                    </div>

                                    <div className="space-y-6">
                                        {activeModule.topics.map((topic, idx) => (
                                            <Card key={idx} className="border shadow-none bg-card/50">
                                                <CardHeader className="pb-2">
                                                    <div className="flex items-center justify-between">
                                                        <CardTitle className="text-lg font-semibold">{topic.title}</CardTitle>
                                                        {topic.actionLink && (
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                className="h-8 text-xs gap-2 ml-4 hidden sm:flex"
                                                                onClick={() => router.push(topic.actionLink!)}
                                                            >
                                                                {topic.actionLabel || "Open Page"}
                                                                <ExternalLink className="w-3 h-3" />
                                                            </Button>
                                                        )}
                                                    </div>
                                                </CardHeader>
                                                <CardContent>
                                                    <ol className="relative border-l border-muted ml-3 space-y-4">
                                                        {topic.steps.map((step, stepIdx) => (
                                                            <li key={stepIdx} className="ml-6 relative">
                                                                <span className="absolute flex items-center justify-center w-6 h-6 bg-muted rounded-full -left-9 ring-4 ring-background text-xs font-medium text-muted-foreground">
                                                                    {stepIdx + 1}
                                                                </span>
                                                                <p className="text-sm text-foreground/80 leading-relaxed">{step}</p>
                                                            </li>
                                                        ))}
                                                    </ol>

                                                    {topic.actionLink && (
                                                        <Button
                                                            variant="link"
                                                            className="mt-4 p-0 h-auto text-primary sm:hidden"
                                                            onClick={() => router.push(topic.actionLink!)}
                                                        >
                                                            {topic.actionLabel || "Open Page"} →
                                                        </Button>
                                                    )}
                                                </CardContent>
                                            </Card>
                                        ))}
                                    </div>
                                </div>
                            </ScrollArea>
                        ) : (
                            <div className="flex items-center justify-center h-full text-muted-foreground">
                                Select a module to view documentation
                            </div>
                        )}
                    </main>
                </div>
            ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-12 border rounded-xl bg-muted/5 border-dashed">
                    <Search className="w-12 h-12 text-muted-foreground/30 mb-4" />
                    <h3 className="text-lg font-medium text-foreground">No results found</h3>
                    <p className="text-muted-foreground max-w-sm mt-2">
                        We couldn't find any help topics matching "{searchQuery}". Try searching for specific keywords like "invoice", "stock", or "report".
                    </p>
                    <Button
                        variant="ghost"
                        className="mt-4"
                        onClick={() => setSearchQuery("")}
                    >
                        Clear Search
                    </Button>
                </div>
            )}
        </div>
    );
}
