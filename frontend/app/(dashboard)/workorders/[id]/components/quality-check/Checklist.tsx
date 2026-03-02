"use client";

import React from "react";
import { ListChecks, CheckCircle2, Wrench, Eye } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface ChecklistProps {
    checklist: {
        allTasksCompleted: boolean;
        allPartsInstalled: boolean;
        vehicleClean: boolean;
        noDamage: boolean;
        testDrivePassed: boolean;
        customerSatisfied: boolean;
        afterRepairsInspection: boolean;
    };
    handleChecklistChange: (key: any) => void;
    workOrder: any;
    allChecksPassed: boolean;
}

export function Checklist({
    checklist,
    handleChecklistChange,
    workOrder,
    allChecksPassed,
}: ChecklistProps) {
    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                    <div className="bg-primary/10 p-1.5 rounded-md">
                        <ListChecks className="w-4 h-4 text-primary" />
                    </div>
                    <h3 className="text-sm font-bold text-foreground">Verification Checklist</h3>
                </div>
                {allChecksPassed ? (
                    <Badge className="bg-green-500/10 text-green-600 border-green-200/50 hover:bg-green-500/10 gap-1 px-1.5 py-0 h-5 text-[10px]">
                        <CheckCircle2 className="w-3 h-3" />
                        Verified
                    </Badge>
                ) : (
                    <Badge variant="outline" className="text-[10px] text-muted-foreground border-border/50 font-medium h-5">
                        {Object.values(checklist).filter((v) => v).length}/{Object.values(checklist).length} Done
                    </Badge>
                )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Category: Execution */}
                <Card className="border-border/40 shadow-none bg-background/40 overflow-hidden h-full">
                    <div className="py-2 px-4 bg-muted/20 border-b border-border/30 flex items-center gap-2">
                        <Wrench className="w-3 h-3 text-muted-foreground/70" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80">Execution</span>
                    </div>
                    <CardContent className="p-3 space-y-3">
                        <div className="flex items-start space-x-3 group cursor-pointer" onClick={() => handleChecklistChange("allTasksCompleted")}>
                            <Checkbox
                                id="allTasksCompleted"
                                checked={checklist.allTasksCompleted}
                                onCheckedChange={() => handleChecklistChange("allTasksCompleted")}
                                className="mt-0.5"
                            />
                            <div className="grid gap-0.5 leading-none">
                                <Label htmlFor="allTasksCompleted" className="text-sm font-semibold cursor-pointer group-hover:text-primary transition-colors">
                                    Technical Tasks
                                </Label>
                                <p className="text-[10px] text-muted-foreground">
                                    All assigned work completed
                                </p>
                            </div>
                        </div>

                        <div className="flex items-start space-x-3 group cursor-pointer" onClick={() => handleChecklistChange("allPartsInstalled")}>
                            <Checkbox
                                id="allPartsInstalled"
                                checked={checklist.allPartsInstalled}
                                onCheckedChange={() => handleChecklistChange("allPartsInstalled")}
                                className="mt-0.5"
                            />
                            <div className="grid gap-0.5 leading-none">
                                <Label htmlFor="allPartsInstalled" className="text-sm font-semibold cursor-pointer group-hover:text-primary transition-colors">
                                    Parts Verification
                                </Label>
                                <p className="text-[10px] text-muted-foreground">
                                    All parts accounted for
                                </p>
                            </div>
                        </div>

                        <div className="flex items-start space-x-3 group cursor-pointer" onClick={() => handleChecklistChange("testDrivePassed")}>
                            <Checkbox
                                id="testDrivePassed"
                                checked={checklist.testDrivePassed}
                                onCheckedChange={() => handleChecklistChange("testDrivePassed")}
                                className="mt-0.5"
                            />
                            <div className="grid gap-0.5 leading-none">
                                <Label htmlFor="testDrivePassed" className="text-sm font-semibold cursor-pointer group-hover:text-primary transition-colors">
                                    Test Drive
                                </Label>
                                <p className="text-[10px] text-muted-foreground">Operational check passed</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Category: Quality & Care */}
                <Card className="border-border/40 shadow-none bg-background/40 overflow-hidden h-full">
                    <div className="py-2 px-4 bg-muted/20 border-b border-border/30 flex items-center gap-2">
                        <Eye className="w-3 h-3 text-muted-foreground/70" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80">Quality & Care</span>
                    </div>
                    <CardContent className="p-3 space-y-3">
                        <div className="flex items-start space-x-3 group cursor-pointer" onClick={() => handleChecklistChange("afterRepairsInspection")}>
                            <Checkbox
                                id="afterRepairsInspection"
                                checked={checklist.afterRepairsInspection}
                                onCheckedChange={() => handleChecklistChange("afterRepairsInspection")}
                                className="mt-0.5 border-primary/50 data-[state=checked]:bg-primary"
                            />
                            <div className="grid gap-0.5 leading-none">
                                <Label htmlFor="afterRepairsInspection" className="text-sm font-bold cursor-pointer group-hover:text-primary transition-colors text-primary italic">
                                    Post-Repair Inspection
                                </Label>
                                <p className="text-[10px] text-muted-foreground italic">Final inspection confirmed</p>
                            </div>
                        </div>

                        <div className="flex items-start space-x-3 group cursor-pointer" onClick={() => handleChecklistChange("noDamage")}>
                            <Checkbox
                                id="noDamage"
                                checked={checklist.noDamage}
                                onCheckedChange={() => handleChecklistChange("noDamage")}
                                className="mt-0.5"
                            />
                            <div className="grid gap-0.5 leading-none">
                                <Label htmlFor="noDamage" className="text-sm font-semibold cursor-pointer group-hover:text-primary transition-colors">
                                    Condition Integrity
                                </Label>
                                <p className="text-[10px] text-muted-foreground">No damage markers</p>
                            </div>
                        </div>

                        <div className="flex items-start space-x-3 group cursor-pointer" onClick={() => handleChecklistChange("vehicleClean")}>
                            <Checkbox
                                id="vehicleClean"
                                checked={checklist.vehicleClean}
                                onCheckedChange={() => handleChecklistChange("vehicleClean")}
                                className="mt-0.5"
                            />
                            <div className="grid gap-0.5 leading-none">
                                <Label htmlFor="vehicleClean" className="text-sm font-semibold cursor-pointer group-hover:text-primary transition-colors">
                                    Cleanliness
                                </Label>
                                <p className="text-[10px] text-muted-foreground">Ready for delivery</p>
                            </div>
                        </div>

                        <div className="flex items-start space-x-3 group cursor-pointer" onClick={() => handleChecklistChange("customerSatisfied")}>
                            <Checkbox
                                id="customerSatisfied"
                                checked={checklist.customerSatisfied}
                                onCheckedChange={() => handleChecklistChange("customerSatisfied")}
                                className="mt-0.5"
                            />
                            <div className="grid gap-0.5 leading-none">
                                <Label htmlFor="customerSatisfied" className="text-sm font-semibold cursor-pointer group-hover:text-primary transition-colors">
                                    Internal QC Approved
                                </Label>
                                <p className="text-[10px] text-muted-foreground">Workshop standards met</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
