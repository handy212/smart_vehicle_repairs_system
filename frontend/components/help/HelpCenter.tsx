"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
    AlertTriangle,
    ArrowLeft,
    BookOpen,
    CheckCircle2,
    ChevronRight,
    Download,
    ExternalLink,
    Lightbulb,
    Mail,
    Search,
    XCircle,
} from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { allGuides, helpSections } from "@/lib/help";
import { downloadHelpManualPdf } from "@/lib/help/pdf";
import type { HelpBlock, HelpGuide, HelpSectionId } from "@/lib/help/types";
import { cn } from "@/lib/utils/cn";

type HelpCenterProps = {
    title: string;
    subtitle: string;
    supportHref?: string;
    supportLabel?: string;
};

function normalize(value: string) {
    return value.trim().toLowerCase();
}

function blockToSearchText(block: HelpBlock): string {
    switch (block.type) {
        case "paragraph":
        case "note":
            return block.text;
        case "steps":
        case "checklist":
        case "tips":
        case "mistakes":
            return block.items.join(" ");
        case "troubleshooting":
            return block.items.map((item) => `${item.problem} ${item.solution}`).join(" ");
        case "screenshot":
            return `${block.label} ${block.caption ?? ""}`;
        default:
            return "";
    }
}

function guideMatches(guide: HelpGuide, query: string): HelpGuide | null {
    const guideText = normalize(
        [guide.title, guide.description, ...(guide.responsibilities ?? []), ...(guide.keywords ?? [])].join(" ")
    );
    if (guideText.includes(query)) return guide;

    const matchingTopics = guide.topics.filter((topic) => {
        const topicText = normalize(
            [
                topic.title,
                topic.summary ?? "",
                ...(topic.keywords ?? []),
                ...topic.blocks.map(blockToSearchText),
            ].join(" ")
        );
        return topicText.includes(query);
    });

    if (matchingTopics.length > 0) {
        return { ...guide, topics: matchingTopics };
    }

    return null;
}

function filterGuides(guides: HelpGuide[], searchQuery: string): HelpGuide[] {
    const query = normalize(searchQuery);
    if (!query) return guides;
    return guides.map((guide) => guideMatches(guide, query)).filter((g): g is HelpGuide => g !== null);
}

function FormattedText({ text }: { text: string }) {
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

function HelpBlockRenderer({ block }: { block: HelpBlock }) {
    switch (block.type) {
        case "paragraph":
            return (
                <p className="text-sm leading-relaxed text-foreground/85">
                    <FormattedText text={block.text} />
                </p>
            );
        case "note":
            return (
                <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm leading-relaxed text-foreground/90">
                    <FormattedText text={block.text} />
                </div>
            );
        case "steps":
            return (
                <ol className="space-y-3">
                    {block.items.map((item, index) => (
                        <li key={index} className="flex gap-3">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                                {index + 1}
                            </span>
                            <p className="pt-0.5 text-sm leading-relaxed text-foreground/85">
                                <FormattedText text={item} />
                            </p>
                        </li>
                    ))}
                </ol>
            );
        case "checklist":
            return (
                <div className="space-y-2">
                    {block.title && (
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{block.title}</p>
                    )}
                    <ul className="space-y-2">
                        {block.items.map((item, index) => (
                            <li key={index} className="flex gap-2.5 text-sm leading-relaxed text-foreground/85">
                                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                                <span>
                                    <FormattedText text={item} />
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            );
        case "tips":
            return (
                <div className="space-y-2 rounded-lg border border-amber-200/60 bg-amber-50/50 px-4 py-3 dark:border-amber-900/40 dark:bg-amber-950/20">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                        <Lightbulb className="h-3.5 w-3.5" />
                        {block.title ?? "Tips"}
                    </div>
                    <ul className="space-y-1.5">
                        {block.items.map((item, index) => (
                            <li key={index} className="text-sm leading-relaxed text-foreground/85">
                                <FormattedText text={item} />
                            </li>
                        ))}
                    </ul>
                </div>
            );
        case "mistakes":
            return (
                <div className="space-y-2 rounded-lg border border-red-200/60 bg-red-50/50 px-4 py-3 dark:border-red-900/40 dark:bg-red-950/20">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-red-700 dark:text-red-400">
                        <XCircle className="h-3.5 w-3.5" />
                        {block.title ?? "Common Mistakes"}
                    </div>
                    <ul className="space-y-1.5">
                        {block.items.map((item, index) => (
                            <li key={index} className="text-sm leading-relaxed text-foreground/85">
                                <FormattedText text={item} />
                            </li>
                        ))}
                    </ul>
                </div>
            );
        case "troubleshooting":
            return (
                <div className="space-y-3">
                    {block.items.map((item, index) => (
                        <div key={index} className="rounded-lg border border-border bg-muted/30 p-4">
                            <div className="flex items-start gap-2">
                                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                                <div className="min-w-0 space-y-1.5">
                                    <p className="text-sm font-semibold text-foreground">{item.problem}</p>
                                    <p className="text-sm leading-relaxed text-muted-foreground">{item.solution}</p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            );
        case "screenshot":
            return (
                <div className="overflow-hidden rounded-lg border border-dashed border-border bg-muted/40">
                    <div className="flex aspect-video items-center justify-center px-4 text-center">
                        <div>
                            <p className="text-sm font-medium text-muted-foreground">[Screenshot Placeholder]</p>
                            <p className="mt-1 text-xs text-muted-foreground">{block.label}</p>
                        </div>
                    </div>
                    {block.caption && (
                        <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">{block.caption}</p>
                    )}
                </div>
            );
        default:
            return null;
    }
}
export function HelpCenter({
    title,
    subtitle,
    supportHref = "mailto:support@smartrepairs.com",
    supportLabel = "Email Support",
}: HelpCenterProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const [activeSectionId, setActiveSectionId] = useState<HelpSectionId>("overview");
    const [activeGuideId, setActiveGuideId] = useState<string | null>(null);
    const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
    const router = useRouter();

    const sectionGuides = useMemo(
        () => allGuides.filter((guide) => guide.section === activeSectionId),
        [activeSectionId]
    );

    const filteredGuides = useMemo(
        () => filterGuides(searchQuery ? allGuides : sectionGuides, searchQuery),
        [searchQuery, sectionGuides]
    );

    const activeGuide = useMemo(() => {
        if (!activeGuideId) return null;
        return filteredGuides.find((g) => g.id === activeGuideId) ?? allGuides.find((g) => g.id === activeGuideId) ?? null;
    }, [activeGuideId, filteredGuides]);

    const navigateToAction = (href: string) => {
        if (href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("http")) {
            window.location.href = href;
            return;
        }
        router.push(href);
    };

    const handleSectionChange = (sectionId: HelpSectionId) => {
        setActiveSectionId(sectionId);
        setActiveGuideId(null);
        if (searchQuery) setSearchQuery("");
    };

    const handleDownloadPdf = async () => {
        setIsDownloadingPdf(true);
        try {
            await downloadHelpManualPdf({
                title,
                subtitle,
                sections: helpSections.map((section) => ({
                    section,
                    guides: allGuides.filter((guide) => guide.section === section.id),
                })),
                filename: "help-manual.pdf",
            });
        } finally {
            setIsDownloadingPdf(false);
        }
    };

    return (
        <>
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
                                    placeholder="Search guides, workflows, roles..."
                                    value={searchQuery}
                                    onChange={(event) => {
                                        setSearchQuery(event.target.value);
                                        setActiveGuideId(null);
                                    }}
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
                            <Button variant="outline" onClick={handleDownloadPdf} disabled={isDownloadingPdf} className="shrink-0">
                                <Download className="h-4 w-4" />
                                {isDownloadingPdf ? "Generating..." : "Download PDF"}
                            </Button>
                        </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                        <Badge variant="secondary">{helpSections.length} sections</Badge>
                        <Badge variant="secondary">{allGuides.length} guides</Badge>
                        {searchQuery && <Badge variant="outline">Filtered by &quot;{searchQuery}&quot;</Badge>}
                    </div>
                </header>

                <div className="flex min-h-0 flex-1 gap-4 md:gap-5">
                    <aside className="hidden w-64 shrink-0 overflow-hidden rounded-lg border border-border bg-card shadow-sm lg:flex lg:w-72 lg:flex-col">
                        <div className="border-b border-border p-4">
                            <h2 className="text-xs font-semibold uppercase text-muted-foreground">Documentation</h2>
                        </div>
                        <ScrollArea className="flex-1">
                            <div className="space-y-1 p-2">
                                {helpSections.map((section) => {
                                    const Icon = section.icon;
                                    const isActive = !searchQuery && activeSectionId === section.id;
                                    const guideCount = allGuides.filter((g) => g.section === section.id).length;

                                    return (
                                        <button
                                            key={section.id}
                                            type="button"
                                            onClick={() => handleSectionChange(section.id)}
                                            className={cn(
                                                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
                                                isActive
                                                    ? "bg-primary/10 font-medium text-primary"
                                                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                            )}
                                        >
                                            <Icon className="h-4 w-4 shrink-0" />
                                            <span className="min-w-0 flex-1 truncate">{section.title}</span>
                                            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                                                {guideCount}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </ScrollArea>
                    </aside>

                    <main className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm">
                        <div className="border-b border-border lg:hidden">
                            <ScrollArea className="w-full">
                                <div className="flex gap-1 p-2">
                                    {helpSections.map((section) => (
                                        <Button
                                            key={section.id}
                                            variant={activeSectionId === section.id && !searchQuery ? "default" : "ghost"}
                                            size="sm"
                                            className="shrink-0 text-xs"
                                            onClick={() => handleSectionChange(section.id)}
                                        >
                                            {section.title}
                                        </Button>
                                    ))}
                                </div>
                            </ScrollArea>
                        </div>

                        <ScrollArea className="flex-1">
                            {filteredGuides.length === 0 ? (
                                <div className="flex flex-col items-center justify-center p-8 text-center">
                                    <Search className="mb-4 h-10 w-10 text-muted-foreground" />
                                    <h2 className="text-lg font-semibold">No matching guides</h2>
                                    <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                                        Try another search term — role name, workflow, invoice, mobile, etc.
                                    </p>
                                    <Button variant="outline" className="mt-4" onClick={() => setSearchQuery("")}>
                                        Clear Search
                                    </Button>
                                </div>
                            ) : activeGuide ? (
                                <GuideDetail
                                    guide={activeGuide}
                                    onBack={() => setActiveGuideId(null)}
                                    onNavigate={navigateToAction}
                                />
                            ) : (
                                <GuideGrid
                                    guides={filteredGuides}
                                    sectionTitle={
                                        searchQuery
                                            ? `Search results (${filteredGuides.length})`
                                            : helpSections.find((s) => s.id === activeSectionId)?.title ?? "Guides"
                                    }
                                    sectionDescription={
                                        searchQuery
                                            ? "Topics matching your search across all documentation."
                                            : helpSections.find((s) => s.id === activeSectionId)?.description
                                    }
                                    onSelect={(id) => setActiveGuideId(id)}
                                />
                            )}
                        </ScrollArea>
                    </main>
                </div>
            </div>
        </>
    );
}

function GuideGrid({
    guides,
    sectionTitle,
    sectionDescription,
    onSelect,
}: {
    guides: HelpGuide[];
    sectionTitle: string;
    sectionDescription?: string;
    onSelect: (id: string) => void;
}) {
    return (
        <div className="p-5 md:p-7">
            <div className="mb-6">
                <h2 className="text-lg font-semibold text-foreground md:text-xl">{sectionTitle}</h2>
                {sectionDescription && (
                    <p className="mt-1 text-sm text-muted-foreground">{sectionDescription}</p>
                )}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {guides.map((guide) => {
                    const Icon = guide.icon;
                    return (
                        <Card
                            key={guide.id}
                            role="button"
                            tabIndex={0}
                            className="group cursor-pointer rounded-lg border-border shadow-none transition-colors hover:border-primary/50 hover:bg-primary/5"
                            onClick={() => onSelect(guide.id)}
                            onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault();
                                    onSelect(guide.id);
                                }
                            }}
                        >
                            <CardContent className="flex h-full flex-col gap-3 p-5">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground group-hover:text-primary">
                                        <Icon className="h-5 w-5" />
                                    </div>
                                    <Badge variant="outline">{guide.topics.length} topics</Badge>
                                </div>
                                <div className="min-w-0 flex-1">
                                    <h3 className="text-sm font-semibold text-foreground">{guide.title}</h3>
                                    <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">{guide.description}</p>
                                </div>
                                <div className="flex items-center text-xs font-semibold text-primary">
                                    Open Guide
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

function GuideDetail({
    guide,
    onBack,
    onNavigate,
}: {
    guide: HelpGuide;
    onBack: () => void;
    onNavigate: (href: string) => void;
}) {
    const Icon = guide.icon;

    return (
        <div className="p-5 md:p-7">
            <Button variant="ghost" size="sm" onClick={onBack} className="mb-4">
                <ArrowLeft className="h-4 w-4" />
                Back to guides
            </Button>

            <div className="mb-6 flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Icon className="h-6 w-6" />
                    </div>
                    <div className="min-w-0">
                        <h2 className="text-xl font-semibold text-foreground md:text-2xl">{guide.title}</h2>
                        <p className="mt-1 text-sm text-muted-foreground">{guide.description}</p>
                    </div>
                </div>
                <Badge variant="secondary" className="w-fit shrink-0">
                    {guide.topics.length} topics
                </Badge>
            </div>

            {guide.responsibilities && guide.responsibilities.length > 0 && (
                <div className="mb-6 rounded-lg border border-border bg-muted/30 p-4">
                    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Role Responsibilities
                    </h3>
                    <ul className="grid gap-2 sm:grid-cols-2">
                        {guide.responsibilities.map((item, index) => (
                            <li key={index} className="flex gap-2 text-sm text-foreground/85">
                                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                                {item}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <Accordion type="single" collapsible className="space-y-3">
                {guide.topics.map((topic, topicIndex) => (
                    <AccordionItem
                        key={`${guide.id}-${topic.title}`}
                        value={`${guide.id}-${topicIndex}`}
                        className="rounded-lg border border-border bg-background px-4"
                    >
                        <AccordionTrigger className="py-4 text-left text-sm font-semibold hover:no-underline">
                            <div className="min-w-0 pr-2">
                                <span>{topic.title}</span>
                                {topic.summary && (
                                    <p className="mt-0.5 text-xs font-normal text-muted-foreground">{topic.summary}</p>
                                )}
                            </div>
                        </AccordionTrigger>
                        <AccordionContent className="pb-5">
                            <div className="space-y-5 pt-1">
                                {topic.blocks.map((block, blockIndex) => (
                                    <HelpBlockRenderer key={blockIndex} block={block} />
                                ))}
                                {topic.actionLink && (
                                    <Button size="sm" onClick={() => onNavigate(topic.actionLink!)}>
                                        {topic.actionLabel || "Open in System"}
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
