import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Car } from "lucide-react";
import { HelpCenter } from "@/components/help/HelpCenter";
import type { HelpGuide } from "@/lib/help/types";

vi.mock("@/lib/help", () => {
    const mockGuides: HelpGuide[] = [
        {
            id: "overview-test",
            title: "Test Overview",
            description: "Test documentation home.",
            icon: Car,
            section: "overview",
            topics: [
                {
                    title: "Welcome topic",
                    blocks: [{ type: "paragraph", text: "Welcome to the help center." }],
                },
            ],
        },
        {
            id: "vehicles-test",
            title: "Vehicles",
            description: "Manage customer vehicles.",
            icon: Car,
            section: "modules",
            keywords: ["vin"],
            topics: [
                {
                    title: "Adding vehicles",
                    blocks: [
                        {
                            type: "steps",
                            items: ["Open **Vehicles** and select New Vehicle.", "Save the profile."],
                        },
                    ],
                    actionLink: "/vehicles/new",
                    actionLabel: "Add Vehicle",
                },
            ],
        },
    ];

    return {
        allGuides: mockGuides,
        helpSections: [
            {
                id: "overview",
                title: "Documentation Home",
                description: "Welcome",
                icon: Car,
            },
            {
                id: "modules",
                title: "Module Reference",
                description: "Modules",
                icon: Car,
            },
        ],
        countTopics: (guides: HelpGuide[]) => guides.reduce((n, g) => n + g.topics.length, 0),
    };
});

describe("HelpCenter", () => {
    it("renders documentation header and guide cards", () => {
        render(
            <HelpCenter
                title="Help Center"
                subtitle="Guides for staff"
                supportHref="mailto:support@example.com"
            />
        );

        expect(screen.getByText("Help Center")).toBeInTheDocument();
        expect(screen.getByText("Test Overview")).toBeInTheDocument();
    });

    it("opens a guide and renders formatted steps", () => {
        render(
            <HelpCenter
                title="Help Center"
                subtitle="Guides for staff"
                supportHref="mailto:support@example.com"
            />
        );

        const moduleButtons = screen.getAllByRole("button", { name: /module reference/i });
        fireEvent.click(moduleButtons[0]);
        fireEvent.click(screen.getByText("Open Guide"));
        fireEvent.click(screen.getByRole("button", { name: /adding vehicles/i }));

        expect(screen.getByText("Vehicles", { selector: "strong" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /add vehicle/i })).toBeInTheDocument();
    });

    it("filters guides and can clear empty searches", () => {
        render(
            <HelpCenter
                title="Help Center"
                subtitle="Guides for staff"
                supportHref="mailto:support@example.com"
            />
        );

        fireEvent.change(screen.getByLabelText("Search help topics"), {
            target: { value: "missing topic xyz" },
        });
        expect(screen.getByText("No matching guides")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: /clear search/i }));
        expect(screen.getByText("Test Overview")).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText("Search help topics"), {
            target: { value: "profile" },
        });
        expect(screen.getByText("Vehicles")).toBeInTheDocument();
    });
});
