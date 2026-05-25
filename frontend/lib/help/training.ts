import { GraduationCap } from "lucide-react";
import type { HelpGuide } from "./types";

export const trainingGuides: HelpGuide[] = [
    {
        id: "training-program",
        title: "Training Recommendations",
        description: "Structured onboarding plan for new staff by role.",
        icon: GraduationCap,
        section: "training",
        keywords: ["training", "onboarding", "learning"],
        topics: [
            {
                title: "Recommended onboarding process",
                blocks: [
                    {
                        type: "paragraph",
                        text: "Train staff in the order they interact with the system and customers. Hands-on practice with test records is more effective than reading alone. Assign a buddy from the same role for the first two weeks.",
                    },
                    {
                        type: "steps",
                        items: [
                            "**Day 1 — All roles:** Login, navigation, global search (Ctrl+K), notifications, profile settings.",
                            "**Day 1 — Role quick start:** Complete the relevant Quick Start guide with trainer supervision.",
                            "**Days 2–3 — Core workflows:** Role-specific procedures with live shadowing.",
                            "**Days 4–5 — Edge cases:** Duplicates, paused jobs, partial payments, gate pass exceptions.",
                            "**Week 2 — Independence:** Staff performs tasks with trainer spot-checks.",
                            "**Week 3 — Assessment:** Trainer verifies checklist completion per role.",
                        ],
                    },
                ],
            },
            {
                title: "Role-based training order and duration",
                blocks: [
                    {
                        type: "paragraph",
                        text: "Suggested training duration by role (assuming daily 2–3 hour sessions):",
                    },
                    {
                        type: "checklist",
                        items: [
                            "**Receptionist** — 3 days core + 2 days billing basics (total ~5 days)",
                            "**Technician** — 2 days desktop + 2 days mobile + ongoing QC coaching (~4 days initial)",
                            "**Service Coordinator** — 5 days (must understand full repair lifecycle and Kanban)",
                            "**Parts Manager** — 4 days (inventory, POs, transfers, counts)",
                            "**Accountant** — 5 days (billing, tills, accounting reports, reconciliation)",
                            "**Manager** — 3 days (dashboards, reports, approvals) assuming prior shop experience",
                            "**Administrator** — 5–7 days (users, roles, settings, integrations, backups)",
                            "**Customer Portal** — 15-minute self-service orientation (provide handout or QR link)",
                        ],
                    },
                ],
            },
            {
                title: "Recommended practice workflows",
                blocks: [
                    {
                        type: "steps",
                        items: [
                            "**Practice 1:** Create test customer → vehicle → Check-In → inspection (use TEST prefix in names).",
                            "**Practice 2:** Full repair cycle through estimate approval using two trainers as customer/coordinator.",
                            "**Practice 3:** Parts request → PO → receive → allocate → invoice.",
                            "**Practice 4:** Counter payment with till open/close.",
                            "**Practice 5:** Gate pass release after payment.",
                            "Delete or archive test records after training week.",
                        ],
                    },
                ],
                actionLink: "/check-in",
                actionLabel: "Start Practice Check-In",
            },
            {
                title: "Training materials in this Help Center",
                blocks: [
                    {
                        type: "tips",
                        items: [
                            "Use **Quick Start** guides for day-one orientation",
                            "Use **Role Guides** as the primary reference manual",
                            "Use **Workflow Guides** for cross-role handoff training",
                            "Use **Best Practices** for week-two quality standards",
                            "Use **Troubleshooting** for support desk reference",
                        ],
                    },
                ],
            },
        ],
    },
];
