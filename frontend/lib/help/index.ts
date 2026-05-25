import { BookOpen } from "lucide-react";
import { helpContent as legacyModuleContent } from "@/lib/help-data";
import { bestPracticeGuides } from "./best-practices";
import { deploymentGuides } from "./deployment";
import { glossaryGuides } from "./glossary";
import { quickStartGuides } from "./quick-start";
import { roleGuides } from "./role-guides";
import { helpSections } from "./sections";
import { trainingGuides } from "./training";
import { troubleshootingGuides } from "./troubleshooting";
import type { HelpGuide, HelpModule, HelpSectionId } from "./types";
import { workflowGuides } from "./workflows";

function convertLegacyModules(modules: Record<string, HelpModule>): HelpGuide[] {
    return Object.values(modules).map((module) => ({
        id: `module-${module.id}`,
        title: module.title,
        description: module.description,
        icon: module.icon,
        section: "modules" as HelpSectionId,
        keywords: module.keywords,
        topics: module.topics.map((topic) => ({
            title: topic.title,
            blocks: [{ type: "steps" as const, items: topic.steps }],
            actionLink: topic.actionLink,
            actionLabel: topic.actionLabel,
            keywords: topic.keywords,
        })),
    }));
}

export const overviewGuide: HelpGuide = {
    id: "overview-home",
    title: "Smart Vehicle Repair System Documentation",
    description:
        "Production-quality guides for staff, managers, customers, and administrators.",
    icon: BookOpen,
    section: "overview",
    keywords: ["documentation", "help", "overview", "getting started"],
    topics: [
        {
            title: "Welcome",
            blocks: [
                {
                    type: "paragraph",
                    text: "This Help Center is your operational manual for Smart Vehicle Repair System. It is written for real workshop staff — receptionists, technicians, coordinators, parts desk, accountants, and managers — not just IT administrators.",
                },
                {
                    type: "paragraph",
                    text: "Use the sidebar to browse by section. Search finds topics across all guides. Each guide explains why you perform each step, not just which button to click.",
                },
            ],
        },
        {
            title: "Documentation structure",
            blocks: [
                {
                    type: "checklist",
                    items: [
                        "**Role-Based Guides** — Complete manuals for each job function",
                        "**Quick Start Guides** — Day-one checklists for fast onboarding",
                        "**Workflow Guides** — Cross-role processes (repair lifecycle, walk-in, parts, payment)",
                        "**Troubleshooting** — Login, permissions, billing, mobile sync, reports",
                        "**Best Practices** — Standards that reduce mistakes",
                        "**Training** — Onboarding order, duration, and practice exercises",
                        "**Installation & Deployment** — For IT staff deploying Docker production",
                        "**Glossary** — Terms and work order status definitions",
                        "**Module Reference** — Screen-by-screen feature guides",
                    ],
                },
            ],
        },
        {
            title: "Who should read what",
            blocks: [
                {
                    type: "tips",
                    items: [
                        "**Receptionist** → Quick Start, Receptionist Guide, Walk-In Workflow, Customer Intake Best Practices",
                        "**Technician** → Quick Start, Technician Guide, Mobile App Guide, Repair Lifecycle",
                        "**Service Coordinator** → Service Coordinator Guide, Repair Lifecycle, Work Order Best Practices",
                        "**Accountant** → Accountant Guide, Payment to Release Workflow, Troubleshooting (billing)",
                        "**Parts Manager** → Inventory Guide, Parts Request Workflow",
                        "**Manager** → Manager Guide, Reports, Best Practices",
                        "**Administrator** → Administrator Guide, Installation Guide, Security Best Practices",
                        "**Customer** → Customer Portal Guide (share portal URL separately)",
                    ],
                },
            ],
        },
        {
            title: "Support",
            blocks: [
                {
                    type: "paragraph",
                    text: "If you cannot find an answer here, contact your branch administrator first. For technical issues, email support@safetracksystems.com with your branch name, username, and a screenshot of the issue.",
                },
            ],
        },
    ],
};

export const allGuides: HelpGuide[] = [
    overviewGuide,
    ...roleGuides,
    ...quickStartGuides,
    ...workflowGuides,
    ...troubleshootingGuides,
    ...bestPracticeGuides,
    ...trainingGuides,
    ...deploymentGuides,
    ...glossaryGuides,
    ...convertLegacyModules(legacyModuleContent),
];

export function getGuidesBySection(sectionId: HelpSectionId): HelpGuide[] {
    return allGuides.filter((guide) => guide.section === sectionId);
}

export { helpSections };

export function getGuideById(id: string): HelpGuide | undefined {
    return allGuides.find((guide) => guide.id === id);
}

export function countTopics(guides: HelpGuide[]): number {
    return guides.reduce((total, guide) => total + guide.topics.length, 0);
}
