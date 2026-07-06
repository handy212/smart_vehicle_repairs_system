"use client"

import * as React from "react"
import { ChevronsUpDown } from "lucide-react"

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export interface Option {
    value: string
    label: string
}

interface ComboboxProps {
    options: Option[]
    value: string[]
    onChange: (value: string[]) => void
    placeholder?: string
    multiple?: boolean
}

export function Combobox({
    options = [],
    value = [],
    onChange,
    placeholder = "Select options...",
    multiple = false,
}: ComboboxProps) {
    const handleSelect = (optionValue: string) => {
        if (multiple) {
            if (value.includes(optionValue)) {
                onChange(value.filter((v) => v !== optionValue))
            } else {
                onChange([...value, optionValue])
            }
        } else {
            // For single select behavior, we might want to just set it to [optionValue]
            // But if clicking a checked one, maybe deselect? Assuming always select for now.
            onChange([optionValue])
        }
    }

    // Calculate display text
    const getDisplayText = () => {
        if (value.length === 0) return placeholder;

        if (multiple) {
            if (value.length === 1) {
                return options.find(o => o.value === value[0])?.label || placeholder;
            }
            return `${value.length} selected`;
        } else {
            return options.find(o => o.value === value[0])?.label || placeholder;
        }
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between font-normal text-left"
                >
                    <span className="truncate">{getDisplayText()}</span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-full min-w-[var(--radix-dropdown-menu-trigger-width)] max-h-[300px] overflow-y-auto">
                {options.length === 0 ? (
                    <div className="py-3 px-2 text-center text-sm text-muted-foreground">No options found.</div>
                ) : (
                    options.map((option) => (
                        <DropdownMenuCheckboxItem
                            key={option.value}
                            checked={value.includes(option.value)}
                            onCheckedChange={() => handleSelect(option.value)}
                        >
                            {option.label}
                        </DropdownMenuCheckboxItem>
                    ))
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
