"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { ArrowLeft, Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/lib/hooks/useToast";
import { techniciansApi, CreateTechnicianData, skillsApi } from "@/lib/api/technicians";
import { branchesApi } from "@/lib/api/admin";
import { getApiErrorMessage } from "@/lib/api/errors";
import { useQuery } from "@tanstack/react-query";
import { Checkbox } from "@/components/ui/checkbox";
import Link from "next/link";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const formSchema = z.object({
    first_name: z.string().min(2, "First name is required"),
    last_name: z.string().min(2, "Last name is required"),
    email: z.string().email("Invalid email address"),
    phone: z.string().optional(),
    password: z.string().min(8, "Password must be at least 8 characters"),
    branch: z.coerce.number().min(1, "Branch is required"),
    employee_id: z.string().optional(),
    hire_date: z.string().optional(),
    hourly_rate: z.string().optional(),
    role: z.enum(["technician", "service_coordinator"]).default("technician"),
    years_of_experience: z.coerce.number().min(0).default(0),
    bio: z.string().optional(),
    skill_ids: z.array(z.number()).default([]),
});

export default function NewTechnicianPage() {
    const router = useRouter();
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const { data: skills } = useQuery({
        queryKey: ["skills"],
        queryFn: () => skillsApi.list(),
    });

    const { data: branchesData } = useQuery({
        queryKey: ["branches", "active"],
        queryFn: () => branchesApi.list({ is_active: true }),
    });

    const branches = Array.isArray(branchesData) ? branchesData : branchesData?.results || [];

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            first_name: "",
            last_name: "",
            email: "",
            phone: "",
            password: "",
            branch: 0,
            employee_id: "",
            hire_date: "",
            hourly_rate: "",
            role: "technician",
            years_of_experience: 0,
            bio: "",
            skill_ids: [],
        },
    });

    async function onSubmit(data: z.infer<typeof formSchema>) {
        setIsSubmitting(true);
        try {
            const payload: CreateTechnicianData = {
                ...data,
                employee_id: data.employee_id || undefined,
                hire_date: data.hire_date || undefined,
                hourly_rate: data.hourly_rate || undefined,
                phone: data.phone || undefined,
                bio: data.bio || undefined,
            };
            await techniciansApi.create(payload);
            toast({
                title: "Success",
                description: "Technician created successfully",
                variant: "default",
            });
            router.push("/technicians");
        } catch (error) {
            toast({
                title: "Error",
                description: getApiErrorMessage(error, "Failed to create technician"),
                variant: "destructive",
            });
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" asChild>
                    <Link href="/technicians">
                        <ArrowLeft className="h-4 w-4" />
                    </Link>
                </Button>
                <div>
                    <h1 className="text-xl font-semibold tracking-tight">Add Technician</h1>
                    <p className="text-xs text-muted-foreground">Create the user account, HR staff record, and technician profile together</p>
                </div>
            </div>

            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <div className="grid gap-4 lg:grid-cols-2">
                        <Card>
                            <CardHeader className="px-4 py-3">
                                <CardTitle className="text-sm font-semibold">Account</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3 px-4 pb-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <FormField
                                        control={form.control}
                                        name="first_name"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>First Name</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="John" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="last_name"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Last Name</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="Doe" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                <FormField
                                    control={form.control}
                                    name="email"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Email</FormLabel>
                                            <FormControl>
                                                <Input placeholder="john.doe@example.com" type="email" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="phone"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Phone</FormLabel>
                                            <FormControl>
                                                <Input placeholder="(555) 123-4567" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="role"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Role</FormLabel>
                                            <Select value={field.value} onValueChange={field.onChange}>
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Select role" />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    <SelectItem value="technician">Technician</SelectItem>
                                                    <SelectItem value="service_coordinator">Service Coordinator</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="branch"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Branch</FormLabel>
                                            <Select value={field.value ? String(field.value) : ""} onValueChange={(value) => field.onChange(Number(value))}>
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Select branch" />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    {branches.map((branch) => (
                                                        <SelectItem key={branch.id} value={String(branch.id)}>
                                                            {branch.name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="password"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Password</FormLabel>
                                            <FormControl>
                                                <Input type="password" placeholder="••••••••" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </CardContent>
                        </Card>

                        <div className="space-y-4">
                            <Card>
                                <CardHeader className="px-4 py-3">
                                    <CardTitle className="text-sm font-semibold">Employment</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-3 px-4 pb-4">
                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                        <FormField
                                            control={form.control}
                                            name="employee_id"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Employee ID</FormLabel>
                                                    <FormControl>
                                                        <Input placeholder="EMP-001" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="hire_date"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Hire Date</FormLabel>
                                                    <FormControl>
                                                        <Input type="date" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="hourly_rate"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Hourly Rate</FormLabel>
                                                    <FormControl>
                                                        <Input type="number" min="0" step="0.01" placeholder="0.00" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>

                                    <FormField
                                        control={form.control}
                                        name="years_of_experience"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Years of Experience</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="number"
                                                        min="0"
                                                        {...field}
                                                        value={(field.value as number) ?? ""}
                                                        onChange={(e) => field.onChange(e.target.valueAsNumber)}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="bio"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Bio</FormLabel>
                                                <FormControl>
                                                    <Textarea
                                                        placeholder="Specializes in diesel engines and heavy equipment..."
                                                        className="resize-none"
                                                        {...field}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader className="px-4 py-3">
                                    <CardTitle className="text-sm font-semibold">Skills</CardTitle>
                                </CardHeader>
                                <CardContent className="px-4 pb-4">
                                    <FormField
                                        control={form.control}
                                        name="skill_ids"
                                        render={() => (
                                            <FormItem>
                                                {skills && skills.length > 0 ? (
                                                    <div className="grid grid-cols-2 gap-2">
                                                        {skills.map((skill) => (
                                                            <FormField
                                                                key={skill.id}
                                                                control={form.control}
                                                                name="skill_ids"
                                                                render={({ field }) => {
                                                                    return (
                                                                        <FormItem
                                                                            key={skill.id}
                                                                            className="flex flex-row items-start space-x-3 space-y-0"
                                                                        >
                                                                            <FormControl>
                                                                                <Checkbox
                                                                                    checked={field.value?.includes(skill.id)}
                                                                                    onCheckedChange={(checked) => {
                                                                                        return checked
                                                                                            ? field.onChange([...(field.value || []), skill.id])
                                                                                            : field.onChange(
                                                                                                field.value?.filter(
                                                                                                    (value) => value !== skill.id
                                                                                                )
                                                                                            )
                                                                                    }}
                                                                                />
                                                                            </FormControl>
                                                                            <FormLabel className="font-normal cursor-pointer">
                                                                                {skill.name}
                                                                            </FormLabel>
                                                                        </FormItem>
                                                                    )
                                                                }}
                                                            />
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <p className="text-sm text-muted-foreground italic">
                                                        No skills defined yet. Add them under Technicians / Skills.
                                                    </p>
                                                )}
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </CardContent>
                            </Card>
                        </div>
                    </div>

                    <div className="flex justify-end gap-2">
                        <Button variant="outline" asChild>
                            <Link href="/technicians">Cancel</Link>
                        </Button>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {!isSubmitting && <Save className="mr-2 h-4 w-4" />}
                            Create Technician
                        </Button>
                    </div>
                </form>
            </Form>
        </div>
    );
}
