"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
    ArrowLeft,
    BookOpen,
    ChevronRight,
    ExternalLink,
    Mail,
    Search,
    Sparkles,
} from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils/cn";
import type { HelpModule, HelpTopic } from "@/lib/help-data";

type HelpCenterProps = {
    content: Record<string, HelpModule>;
    title: string;
    subtitle: string;
    supportHref?: string;
    supportLabel?: string;
};

type FilteredModule = HelpModule & {
    topics: HelpTopic[];
};

function normalize(value: string) {
    return value.trim().toLowerCase();
}

function topicMatches(topic: HelpTopic, query: string) {
    const haystack = [
        topic.title,
        ...(topic.keywords ?? []),
        ...topic.steps,
    ].join(" ");

    return normalize(haystack).includes(query);
}

function filterHelpContent(content: Record<string, HelpModule>, searchQuery: string) {
    const query = normalize(searchQuery);

    if (!query) {
        return content as Record<string, FilteredModule>;
    }

    return Object.entries(content).reduce<Record<string, FilteredModule>>((acc, [key, module]) => {
        const moduleText = normalize([
            module.title,
            module.description,
            ...(module.keywords ?? []),
        ].join(" "));
        const moduleMatches = moduleText.includes(query);
        const matchingTopics = moduleMatches
            ? module.topics
            : module.topics.filter((topic) => topicMatches(topic, query));

        if (matchingTopics.length > 0) {
            acc[key] = {
                ...module,
                topics: matchingTopics,
            };
        }

        return acc;
    }, {});
}

function FormattedStep({ text }: { text: string }) {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);

    return (
        <>
            {parts.map((part, index) => {
                const isStrong = part.startsWith("**") && part.endsWith("**");
                if (isStrong) {
                    return (
                        <strong key={`${part}-${index}`} className="font-semibold text-foreground">
                            {part.slice(2, -2)}
                        </strong>
                    );
                }

                return <span key={`${part}-${index}`}>{part}</span>;
            })}
        </>
    );
}

export function HelpCenter({
    content,
    title,
    subtitle,
    supportHref = "mailto:support@smartrepairs.com",
    supportLabel = "Email Support",
}: HelpCenterProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const [activeModuleId, setActiveModuleId] = useState<string | null>(null);
    const router = useRouter();

    const filteredContent = useMemo(() => filterHelpContent(content, searchQuery), [content, searchQuery]);
    const modulesArray = useMemo(() => Object.values(filteredContent), [filteredContent]);
    const hasResults = modulesArray.length > 0;
    const selectedModuleId = activeModuleId && filteredContent[activeModuleId] ? activeModuleId : null;
    const activeModule = selectedModuleId ? filteredContent[selectedModuleId] : null;
    const totalTopics = modulesArray.reduce((total, module) => total + module.topics.length, 0);

    const navigateToAction = (href: string) => {
        if (href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("http")) {
            window.location.href = href;
            return;
        }

        router.push(href);
    };

    return (
        <div className="mx-auto flex h-[calc(100vh-5rem)] max-w-7xl flex-col gap-4 p-4 md:gap-5 md:p-6 lg:p-8">
            <header className="shrink-0 rounded-lg border border-border bg-card p-4 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <BookOpen className="h-6 w-6" />
                        </div>
                        <div className="min-w-0">
                            <h1 className="text-xl font-bold text-foreground md:text-2xl">{title}</h1>
                            <p className="text-sm text-muted-foreground">{subtitle}</p>
                        </div>
                    </div>
                    <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto lg:items-center">
                        <div className="relative w-full lg:w-96">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                type="search"
                                placeholder="Search topics, steps, or modules..."
                                value={searchQuery}
                                onChange={(event) => setSearchQuery(event.target.value)}
                                className="h-10 pl-10"
                                aria-label="Search help topics"
                            />
                        </div>
                        <Button variant="outline" asChild className="shrink-0">
                            <Link href={supportHref}>
                                <Mail className="h-4 w-4" />
                                {supportLabel}
                            </Link>
                        </Button>
                    </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                    <Badge variant="secondary">{modulesArray.length} modules</Badge>
                    <Badge variant="secondary">{totalTopics} topics</Badge>
                    {searchQuery && <Badge variant="outline">Filtered by &quot;{searchQuery}&quot;</Badge>}
                </div>
            </header>

            {hasResults ? (
                <div className="flex min-h-0 flex-1 gap-4 md:gap-5">
                    <aside className="hidden w-72 shrink-0 overflow-hidden rounded-lg border border-border bg-card shadow-sm md:flex md:flex-col">
                        <div className="border-b border-border p-4">
                            <h2 className="text-xs font-semibold uppercase text-muted-foreground">Explore</h2>
                        </div>
                        <ScrollArea className="flex-1">
                            <div className="space-y-1 p-2">
                                {modulesArray.map((module) => {
                                    const Icon = module.icon;
                                    const isActive = selectedModuleId === module.id;

                                    return (
                                        <button
                                            key={module.id}
                                            type="button"
                                            onClick={() => setActiveModuleId(module.id)}
                                            className={cn(
                                                "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors",
                                                isActive
                                                    ? "bg-primary/10 text-primary"
                                                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                            )}
                                        >
                                            <Icon className="h-4 w-4 shrink-0" />
                                            <span className="min-w-0 flex-1 truncate">{module.title}</span>
                                            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                                                {module.topics.length}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </ScrollArea>
                    </aside>

                    <main className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm">
                        <ScrollArea className="flex-1">
                            {activeModule ? (
                                <ModuleGuide
                                    module={activeModule}
                                    onBack={() => setActiveModuleId(null)}
                                    onNavigate={navigateToAction}
                                />
                            ) : (
                                <ModuleGrid
                                    modules={modulesArray}
                                    onSelect={(moduleId) => setActiveModuleId(moduleId)}
                                />
                            )}
                        </ScrollArea>
                    </main>
                </div>
            ) : (
                <div className="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card p-8 text-center">
                    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        <Search className="h-7 w-7" />
                    </div>
                    <h2 className="text-lg font-semibold text-foreground">No matching help topics</h2>
                    <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                        Try another module name, workflow, status, document, or action.
                    </p>
                    <Button variant="outline" className="mt-5" onClick={() => setSearchQuery("")}>
                        Clear Search
                    </Button>
                </div>
            )}
        </div>
    );
}

function ModuleGrid({
    modules,
    onSelect,
}: {
    modules: FilteredModule[];
    onSelect: (moduleId: string) => void;
}) {
    return (
        <div className="p-5 md:p-7">
            <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h2 className="text-lg font-semibold text-foreground">Browse Help Modules</h2>
                    <p className="text-sm text-muted-foreground">Open a module to view focused guides and direct actions.</p>
                </div>
                <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
                    <Sparkles className="h-4 w-4 text-primary" />
                    Search narrows modules and topics together
                </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {modules.map((module) => {
                    const Icon = module.icon;

                    return (
                        <Card
                            key={module.id}
                            role="button"
                            tabIndex={0}
                            className="group cursor-pointer rounded-lg border-border shadow-none hover:border-primary/50 hover:bg-primary/5"
                            onClick={() => onSelect(module.id)}
                            onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault();
                                    onSelect(module.id);
                                }
                            }}
                        >
                            <CardContent className="flex h-full flex-col gap-4 p-5">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground group-hover:text-primary">
                                        <Icon className="h-5 w-5" />
                                    </div>
                                    <Badge variant="outline">{module.topics.length} topics</Badge>
                                </div>
                                <div className="min-w-0">
                                    <h3 className="text-sm font-semibold text-foreground">{module.title}</h3>
                                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{module.description}</p>
                                </div>
                                <div className="mt-auto flex items-center text-xs font-semibold text-primary">
                                    View Guide
                                    <ChevronRight className="ml-1 h-3.5 w-3.5" />
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>
        </div>
    );
}

function ModuleGuide({
    module,
    onBack,
    onNavigate,
}: {
    module: FilteredModule;
    onBack: () => void;
    onNavigate: (href: string) => void;
}) {
    const Icon = module.icon;

    return (
        <div className="p-5 md:p-7">
            <Button variant="ghost" size="sm" onClick={onBack} className="mb-4 md:hidden">
                <ArrowLeft className="h-4 w-4" />
                Back
            </Button>
            <div className="mb-6 flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Icon className="h-6 w-6" />
                    </div>
                    <div className="min-w-0">
                        <h2 className="text-xl font-semibold text-foreground md:text-2xl">{module.title}</h2>
                        <p className="text-sm text-muted-foreground">{module.description}</p>
                    </div>
                </div>
                <Badge variant="secondary" className="w-fit">
                    {module.topics.length} topics
                </Badge>
            </div>

            <Accordion type="single" collapsible className="space-y-3">
                {module.topics.map((topic, topicIndex) => (
                    <AccordionItem
                        key={`${module.id}-${topic.title}`}
                        value={`${module.id}-${topicIndex}`}
                        className="rounded-lg border border-border bg-background px-4"
                    >
                        <AccordionTrigger className="py-4 text-left text-sm font-semibold hover:no-underline">
                            <span>{topic.title}</span>
                        </AccordionTrigger>
                        <AccordionContent className="pb-5">
                            <div className="space-y-5 pt-1">
                                <ol className="space-y-4">
                                    {topic.steps.map((step, stepIndex) => (
                                        <li key={`${topic.title}-${stepIndex}`} className="flex gap-3">
                                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                                                {stepIndex + 1}
                                            </span>
                                            <p className="pt-0.5 text-sm leading-relaxed text-foreground/80">
                                                <FormattedStep text={step} />
                                            </p>
                                        </li>
                                    ))}
                                </ol>

                                {topic.actionLink && (
                                    <Button size="sm" onClick={() => onNavigate(topic.actionLink!)}>
                                        {topic.actionLabel || "Open Module"}
                                        <ExternalLink className="h-3.5 w-3.5" />
                                    </Button>
                                )}
                            </div>
                        </AccordionContent>
                    </AccordionItem>
                ))}
            </Accordion>
        </div>
    );
}
