"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import { hrApi } from "@/lib/api/hr";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getUserFacingError } from "@/lib/api/apiErrors";

export default function CareerJobDetailPage() {
    const params = useParams();
    const id = Number(params.id);

    const { data: job, isLoading, isError } = useQuery({
        queryKey: ["hr", "public-job", id],
        queryFn: async () => (await hrApi.jobOpenings.publicGet(id)).data,
        enabled: Number.isFinite(id) && id > 0,
        retry: 1,
    });

    if (isLoading) {
        return (
            <div className="flex min-h-[320px] flex-col items-center justify-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-muted-foreground">Loading job…</p>
            </div>
        );
    }

    if (isError || !job) {
        return (
            <div className="container mx-auto max-w-2xl space-y-4 py-8 text-center">
                <p className="text-muted-foreground">This job opening is no longer available.</p>
                <Button asChild variant="outline">
                    <Link href="/careers"><ArrowLeft className="mr-2 h-4 w-4" />Back to careers</Link>
                </Button>
            </div>
        );
    }

    return (
        <div className="container mx-auto max-w-3xl space-y-6 py-4 md:py-8">
            <Button asChild variant="ghost" size="sm" className="-ml-2">
                <Link href="/careers"><ArrowLeft className="mr-2 h-4 w-4" />All openings</Link>
            </Button>

            <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-3xl font-bold tracking-tight">{job.title}</h1>
                    <Badge variant="secondary">{job.employment_type_display || job.employment_type}</Badge>
                </div>
                <p className="text-muted-foreground">
                    {job.department_name} · {job.branch_name}
                    {job.closing_date ? ` · Apply by ${job.closing_date}` : ""}
                </p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>About the role</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 whitespace-pre-wrap text-sm leading-relaxed">
                    <p>{job.description}</p>
                    {job.requirements && (
                        <div className="space-y-2">
                            <h2 className="font-semibold">Requirements</h2>
                            <p className="text-muted-foreground">{job.requirements}</p>
                        </div>
                    )}
                </CardContent>
            </Card>

            <ApplyForm jobId={job.id} jobTitle={job.title} />
        </div>
    );
}

function ApplyForm({ jobId, jobTitle }: { jobId: number; jobTitle: string }) {
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [coverLetter, setCoverLetter] = useState("");
    const [resume, setResume] = useState<File | null>(null);
    const [submitted, setSubmitted] = useState(false);

    const mutation = useMutation({
        mutationFn: async () => {
            const form = new FormData();
            form.append("job_opening", String(jobId));
            form.append("first_name", firstName.trim());
            form.append("last_name", lastName.trim());
            form.append("email", email.trim());
            if (phone.trim()) form.append("phone", phone.trim());
            if (coverLetter.trim()) form.append("cover_letter", coverLetter.trim());
            if (resume) form.append("resume", resume);
            return (await hrApi.applicants.publicApply(form)).data;
        },
        onSuccess: () => setSubmitted(true),
    });

    if (submitted) {
        return (
            <Card className="border-success/40 bg-success/5">
                <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
                    <CheckCircle2 className="h-10 w-10 text-success" />
                    <div className="space-y-1">
                        <p className="text-lg font-semibold">Application submitted</p>
                        <p className="text-sm text-muted-foreground">
                            Thanks for applying for {jobTitle}. We will contact you if you are shortlisted.
                        </p>
                    </div>
                    <Button asChild variant="outline">
                        <Link href="/careers">Browse more roles</Link>
                    </Button>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Apply for this role</CardTitle>
                <CardDescription>Submit your details. Fields marked * are required.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                        <Label htmlFor="first_name">First name *</Label>
                        <Input id="first_name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="last_name">Last name *</Label>
                        <Input id="last_name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
                    </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                        <Label htmlFor="email">Email *</Label>
                        <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="phone">Phone</Label>
                        <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
                    </div>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="cover_letter">Cover letter</Label>
                    <Textarea
                        id="cover_letter"
                        rows={4}
                        value={coverLetter}
                        onChange={(e) => setCoverLetter(e.target.value)}
                        placeholder="Tell us why you are a great fit…"
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="resume">Resume (PDF or DOC)</Label>
                    <Input
                        id="resume"
                        type="file"
                        accept=".pdf,.doc,.docx,application/pdf"
                        onChange={(e) => setResume(e.target.files?.[0] ?? null)}
                    />
                </div>
                {mutation.isError && (
                    <p className="text-sm text-destructive">
                        {getUserFacingError(mutation.error, "Could not submit application. Please try again.")}
                    </p>
                )}
                <Button
                    className="w-full sm:w-auto"
                    disabled={
                        !firstName.trim() ||
                        !lastName.trim() ||
                        !email.trim() ||
                        mutation.isPending
                    }
                    onClick={() => mutation.mutate()}
                >
                    {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Submit application
                </Button>
            </CardContent>
        </Card>
    );
}
