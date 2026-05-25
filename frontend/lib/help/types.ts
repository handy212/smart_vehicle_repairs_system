import type { LucideIcon } from "lucide-react";

export type HelpBlock =
    | { type: "paragraph"; text: string }
    | { type: "steps"; items: string[] }
    | { type: "checklist"; title?: string; items: string[] }
    | { type: "tips"; title?: string; items: string[] }
    | { type: "mistakes"; title?: string; items: string[] }
    | { type: "troubleshooting"; items: { problem: string; solution: string }[] }
    | { type: "note"; text: string }
    | { type: "screenshot"; label: string; caption?: string };

export type HelpTopic = {
    title: string;
    summary?: string;
    blocks: HelpBlock[];
    actionLink?: string;
    actionLabel?: string;
    keywords?: string[];
};

export type HelpGuide = {
    id: string;
    title: string;
    description: string;
    icon: LucideIcon;
    section: HelpSectionId;
    responsibilities?: string[];
    topics: HelpTopic[];
    keywords?: string[];
};

export type HelpSectionId =
    | "overview"
    | "roles"
    | "quick-start"
    | "workflows"
    | "troubleshooting"
    | "best-practices"
    | "training"
    | "deployment"
    | "glossary"
    | "modules";

export type HelpSection = {
    id: HelpSectionId;
    title: string;
    description: string;
    icon: LucideIcon;
};

/** Legacy module shape kept for module reference section */
export type HelpModule = {
    id: string;
    title: string;
    description: string;
    icon: LucideIcon;
    topics: LegacyHelpTopic[];
    keywords?: string[];
};

export type LegacyHelpTopic = {
    title: string;
    steps: string[];
    actionLink?: string;
    actionLabel?: string;
    keywords?: string[];
};
