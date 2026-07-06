import {
    AlertTriangle,
    BookMarked,
    BookOpen,
    ClipboardList,
    GraduationCap,
    LayoutGrid,
    Rocket,
    Sparkles,
    Users,
} from "lucide-react";
import type { HelpSection } from "./types";

export const helpSections: HelpSection[] = [
    {
        id: "overview",
        title: "Documentation Home",
        description: "Welcome and documentation map",
        icon: BookOpen,
    },
    {
        id: "roles",
        title: "Role-Based Guides",
        description: "Guides for reception, technicians, billing, and more",
        icon: Users,
    },
    {
        id: "quick-start",
        title: "Quick Start",
        description: "Day-one checklists by role",
        icon: Rocket,
    },
    {
        id: "workflows",
        title: "Workflow Guides",
        description: "End-to-end business processes",
        icon: ClipboardList,
    },
    {
        id: "troubleshooting",
        title: "Troubleshooting",
        description: "Fix common issues",
        icon: AlertTriangle,
    },
    {
        id: "best-practices",
        title: "Best Practices",
        description: "Operational standards",
        icon: Sparkles,
    },
    {
        id: "glossary",
        title: "Glossary",
        description: "Terms and definitions",
        icon: BookMarked,
    },
    {
        id: "modules",
        title: "Module Reference",
        description: "Screen-by-screen module guides",
        icon: LayoutGrid,
    },
];
