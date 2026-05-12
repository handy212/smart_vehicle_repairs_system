"use client";

import { HelpCenter } from "@/components/help/HelpCenter";
import { helpContent } from "@/lib/help-data";

export default function HelpPage() {
    return (
        <HelpCenter
            content={helpContent}
            title="Help Center"
            subtitle="Staff guides for Smart Vehicle Repairs modules, workflows, and common actions."
            supportHref="mailto:support@safetracksystems.com"
            supportLabel="Email Support"
        />
    );
}
