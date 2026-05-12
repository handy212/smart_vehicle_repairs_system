import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Car } from "lucide-react";
import { HelpCenter } from "@/components/help/HelpCenter";
import type { HelpModule } from "@/lib/help-data";

const content: Record<string, HelpModule> = {
    vehicles: {
        id: "vehicles",
        title: "Vehicles",
        description: "Manage customer vehicles.",
        icon: Car,
        keywords: ["vin"],
        topics: [
            {
                title: "Adding vehicles",
                steps: ["Open **Vehicles** and select New Vehicle.", "Save the profile."],
                actionLink: "/vehicles/new",
                actionLabel: "Add Vehicle",
            },
        ],
    },
};

describe("HelpCenter", () => {
    it("renders help modules and topics", () => {
        render(
            <HelpCenter
                content={content}
                title="Help Center"
                subtitle="Guides for staff"
                supportHref="mailto:support@example.com"
            />
        );

        expect(screen.getByText("Help Center")).toBeInTheDocument();
        expect(screen.getAllByText("Vehicles").length).toBeGreaterThan(0);

        fireEvent.click(screen.getByText("View Guide"));
        fireEvent.click(screen.getByRole("button", { name: /adding vehicles/i }));

        expect(screen.getAllByText("Vehicles").length).toBeGreaterThan(0);
        expect(screen.getByText("Open")).toBeInTheDocument();
        expect(screen.getByText("Vehicles", { selector: "strong" })).toBeInTheDocument();
    });

    it("filters modules using topic text and can clear empty searches", () => {
        render(
            <HelpCenter
                content={content}
                title="Help Center"
                subtitle="Guides for staff"
                supportHref="mailto:support@example.com"
            />
        );

        fireEvent.change(screen.getByLabelText("Search help topics"), {
            target: { value: "missing topic" },
        });
        expect(screen.getByText("No matching help topics")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: /clear search/i }));
        expect(screen.getAllByText("Vehicles").length).toBeGreaterThan(0);

        fireEvent.change(screen.getByLabelText("Search help topics"), {
            target: { value: "profile" },
        });
        expect(screen.getAllByText("Vehicles").length).toBeGreaterThan(0);
    });
});
