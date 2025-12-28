"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Home } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export function Breadcrumbs() {
    const pathname = usePathname();

    if (!pathname || pathname === "/" || pathname === "/dashboard") {
        return null;
    }

    // Split path into segments and remove empty strings
    const segments = pathname.split("/").filter(Boolean);

    // Generate breadcrumb items
    const items = segments.map((segment, index) => {
        // Build the URL for this segment
        const href = `/${segments.slice(0, index + 1).join("/")}`;

        // Format the label: "roadside" -> "Roadside", "new" -> "New"
        // Also handle IDs which look like UUIDs or numbers -> "Details"
        const isId = /^[0-9]+$/.test(segment) || /^[0-9a-f]{8}-[0-9a-f]{4}/.test(segment);

        let label = "Page";
        if (segment && typeof segment === 'string') {
            label = segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, " ");
        }

        if (isId) {
            label = "Details";
        }

        return {
            href,
            label,
            isLast: index === segments.length - 1,
        };
    });

    return (
        <nav aria-label="Breadcrumb" className="hidden md:flex items-center space-x-1 text-sm text-gray-500 dark:text-gray-400 ml-4 pl-4 border-l border-gray-200 dark:border-gray-800 h-6">
            <Link
                href="/dashboard"
                className="flex items-center hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
            >
                <Home className="w-4 h-4" />
            </Link>

            {items.map((item, index) => (
                <div key={item.href} className="flex items-center">
                    <ChevronRight className="w-4 h-4 mx-1 text-gray-400" />
                    {item.isLast ? (
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                            {item.label}
                        </span>
                    ) : (
                        <Link
                            href={item.href}
                            className="hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
                        >
                            {item.label}
                        </Link>
                    )}
                </div>
            ))}
        </nav>
    );
}
