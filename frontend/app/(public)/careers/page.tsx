"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Briefcase, Building2, Calendar, Loader2, MapPin } from "lucide-react";
import { hrApi, PublicJobOpening } from "@/lib/api/hr";
import { useBranding } from "@/lib/hooks/useBranding";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function CareersPage() {
    const { companyName } = useBranding("public");

    const { data: jobs = [], isLoading, isError } = useQuery({
        queryKey: ["hr", "public-jobs"],
        queryFn: async () => (await hrApi.jobOpenings.publicList()).data,
        retry: 1,
    });

    return (
        <div className="container mx-auto max-w-4xl space-y-8 py-4 md:py-8">
            <div className="space-y-2 text-center">
                <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Careers</h1>
                <p className="text-muted-foreground text-lg">
                    Join the team at {companyName}. Browse open roles and apply online.
                </p>
            </div>

            {isLoading ? (
                <div className="flex min-h-[240px] flex-col items-center justify-center gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-muted-foreground">Loading openings…</p>
                </div>
            ) : isError ? (
                <Card>
                    <CardContent className="py-10 text-center text-muted-foreground">
                        Careers are unavailable right now. Please try again later.
                    </CardContent>
                </Card>
            ) : jobs.length === 0 ? (
                <Card>
                    <CardContent className="py-10 text-center text-muted-foreground">
                        There are no open positions at the moment. Check back soon.
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-4">
                    {jobs.map((job) => (
                        <JobCard key={job.id} job={job} />
                    ))}
                </div>
            )}
        </div>
    );
}

function JobCard({ job }: { job: PublicJobOpening }) {
    return (
        <Card className="transition-colors hover:border-primary/40">
            <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                        <CardTitle className="text-xl">{job.title}</CardTitle>
                        <CardDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span className="inline-flex items-center gap-1">
                                <Building2 className="h-3.5 w-3.5" />
                                {job.department_name}
                            </span>
                            <span className="inline-flex items-center gap-1">
                                <MapPin className="h-3.5 w-3.5" />
                                {job.branch_name}
                            </span>
                        </CardDescription>
                    </div>
                    <Badge variant="secondary">{job.employment_type_display || job.employment_type}</Badge>
                </div>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                    {job.closing_date && (
                        <span className="inline-flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" />
                            Closes {job.closing_date}
                        </span>
                    )}
                    <span className="inline-flex items-center gap-1">
                        <Briefcase className="h-3.5 w-3.5" />
                        {job.vacancies} {job.vacancies === 1 ? "vacancy" : "vacancies"}
                    </span>
                </div>
                <Button asChild>
                    <Link href={`/careers/${job.id}`}>View &amp; Apply</Link>
                </Button>
            </CardContent>
        </Card>
    );
}
