"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { hrApi, JobOpening } from "@/lib/api/hr";
import { Button } from "@/components/ui/button";
import { StaffPageHeader } from "@/components/shared/StaffPageHeader";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { DynamicPageTitle } from "@/components/shared/DynamicPageTitle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";


// Note: DepartmentSelect component assumed to exist or we use a basic input for now to avoid dependency issues if it doesn't exist.
// Checking previous files, I don't see DepartmentSelect. I'll use a simple input for now or fetch departments if I had time, 
// but for this task I'll stick to a number input or simple select if possible.
// Wait, the API client has `departments.list`. I could fetch them. 
// For simplicity in this file, I'll assume the user inputs a department ID or I'll implement a basic fetch.

import { useQuery } from "@tanstack/react-query";

export default function NewJobOpeningPage() {
    return (
        <PermissionGuard permission="manage_recruitment">
            <DynamicPageTitle title="Post New Job" />
            <NewJobOpeningContent />
        </PermissionGuard>
    );
}

function NewJobOpeningContent() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const [title, setTitle] = useState("");
    const [deptId, setDeptId] = useState("");
    const [empType, setEmpType] = useState("full_time");
    const [description, setDescription] = useState("");
    const [requirements, setRequirements] = useState("");
    const [salaryMin, setSalaryMin] = useState("");
    const [salaryMax, setSalaryMax] = useState("");

    const { data: deptData } = useQuery({
        queryKey: ["hr", "departments"],
        queryFn: async () => (await hrApi.departments.list()).data
    });

    const createMutation = useMutation({

        mutationFn: (data: any) => hrApi.jobOpenings.create(data),
        onSuccess: () => {
            toast.success("Job posting created");
            queryClient.invalidateQueries({ queryKey: ["hr", "job-openings"] });
            router.push("/hr/recruitment");
        },
        onError: () => toast.error("Failed to create job posting"),
    });

    const handleSubmit = () => {
        createMutation.mutate({
            title,
            department: Number(deptId),
            employment_type: empType,
            description,
            requirements,
            salary_range_min: salaryMin || null,
            salary_range_max: salaryMax || null,
            status: "draft"
        });
    };

    return (
        <div className="space-y-4 max-w-3xl mx-auto">
            <StaffPageHeader
                title="Post New Job"
                breadcrumbs={[{ label: "Recruitment", href: "/hr/recruitment" }, { label: "New Job" }]}
            />

            <Card>
                <CardHeader><CardTitle>Job Details</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2"><Label>Job Title</Label><Input placeholder="e.g. Senior Mechanic" value={title} onChange={e => setTitle(e.target.value)} /></div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Department</Label>
                            <Select value={deptId} onValueChange={setDeptId}>
                                <SelectTrigger><SelectValue placeholder="Select Department" /></SelectTrigger>
                                <SelectContent>
                                    {deptData?.results.map(d => <SelectItem key={d.id} value={d.id.toString()}>{d.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Employment Type</Label>
                            <Select value={empType} onValueChange={setEmpType}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="full_time">Full Time</SelectItem>
                                    <SelectItem value="part_time">Part Time</SelectItem>
                                    <SelectItem value="contract">Contract</SelectItem>
                                    <SelectItem value="intern">Intern</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-2 bg-muted/20 p-4 rounded-md">
                        <Label>Salary Range (Optional)</Label>
                        <div className="flex gap-4 items-center">
                            <Input placeholder="Min" type="number" value={salaryMin} onChange={e => setSalaryMin(e.target.value)} />
                            <span>-</span>
                            <Input placeholder="Max" type="number" value={salaryMax} onChange={e => setSalaryMax(e.target.value)} />
                        </div>
                    </div>

                    <div className="space-y-2"><Label>Description</Label><Textarea placeholder="Job duties and responsibilities..." rows={4} value={description} onChange={e => setDescription(e.target.value)} /></div>
                    <div className="space-y-2"><Label>Requirements</Label><Textarea placeholder="Skills and qualifications..." rows={4} value={requirements} onChange={e => setRequirements(e.target.value)} /></div>

                    <div className="flex justify-end gap-2 pt-4">
                        <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
                        <Button onClick={handleSubmit} disabled={!title || !deptId || createMutation.isPending}>{createMutation.isPending ? "Creating..." : "Create Job Posting"}</Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
