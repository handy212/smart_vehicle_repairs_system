"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from "lucide-react"
import { DayPicker } from "react-day-picker"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({
    className,
    classNames,
    showOutsideDays = true,
    ...props
}: CalendarProps) {
    return (
        <DayPicker
            showOutsideDays={showOutsideDays}
            className={cn("p-3", className)}
            classNames={{
                months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
                month: "space-y-4 relative",
                month_caption: "flex justify-center pt-1 relative items-center h-7",
                caption_label: "text-sm font-medium h-7 flex items-center justify-center",
                nav: "static",
                button_previous: cn(
                    buttonVariants({ variant: "outline" }),
                    "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 absolute left-1 top-[3px] z-50"
                ),
                button_next: cn(
                    buttonVariants({ variant: "outline" }),
                    "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 absolute right-1 top-[3px] z-50"
                ),
                month_grid: "w-full border-collapse space-y-1",
                weekdays: "flex",
                weekday:
                    "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]",
                week: "flex w-full mt-2",
                day: "h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
                day_button: cn(
                    buttonVariants({ variant: "ghost" }),
                    "h-9 w-9 p-0 font-normal aria-selected:opacity-100 transition-all hover:bg-primary/20 hover:scale-110 active:scale-95"
                ),
                selected:
                    "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground scale-100",
                today: "bg-accent text-accent-foreground font-bold underline underline-offset-4",
                outside:
                    "day-outside text-muted-foreground opacity-30 aria-selected:bg-accent/30 aria-selected:text-muted-foreground aria-selected:opacity-30",
                disabled: "text-muted-foreground opacity-50",
                range_middle:
                    "aria-selected:bg-accent aria-selected:text-accent-foreground",
                hidden: "invisible",
                dropdowns: "flex justify-center gap-1",
                ...classNames,
            }}
            components={{
                Chevron: ({ orientation, ...props }) => {
                    switch (orientation) {
                        case "left":
                            return <ChevronLeft className="h-4 w-4" {...props} />
                        case "right":
                            return <ChevronRight className="h-4 w-4" {...props} />
                        case "up":
                            return <ChevronUp className="h-4 w-4" {...props} />
                        case "down":
                            return <ChevronDown className="h-4 w-4" {...props} />
                        default:
                            return <></>
                    }
                },
                Dropdown: ({ value, onChange, options, ...props }) => {
                    const selected = options?.find((option) => option.value === value)
                    const handleChange = (value: string) => {
                        const changeEvent = {
                            target: { value },
                        } as React.ChangeEvent<HTMLSelectElement>
                        onChange?.(changeEvent)
                    }
                    return (
                        <Select
                            value={value?.toString()}
                            onValueChange={(value) => {
                                handleChange(value)
                            }}
                        >
                            <SelectTrigger className="pr-1.5 focus:ring-0 h-7 w-fit font-medium text-xs border-none bg-transparent hover:bg-accent hover:text-accent-foreground transition-colors">
                                <SelectValue>{selected?.label}</SelectValue>
                            </SelectTrigger>
                            <SelectContent position="popper" className="z-[200]">
                                {options?.map((option) => (
                                    <SelectItem
                                        key={option.value}
                                        value={option.value.toString()}
                                        className="text-xs"
                                    >
                                        {option.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )
                },
            }}
            {...props}
        />
    )
}
Calendar.displayName = "Calendar"

export { Calendar }
