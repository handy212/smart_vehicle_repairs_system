"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useRouter, useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { techniciansApi, skillsApi, Skill } from "@/lib/api/technicians";
import { branchesApi } from "@/lib/api/admin";
import { getApiErrorMessage } from "@/lib/api/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { useState, useEffect } from "react";
import { useToast } from "@/lib/hooks/useToast";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/ui/combobox";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Loader2, ArrowLeft, Upload } from "lucide-react";
import Link from "next/link";
import * as z from "zod";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const formSchema = z.object({
    first_name: z.string().min(2, "First name is required"),
    last_name: z.string().min(2, "Last name is required"),
    email: z.string().email("Invalid email address"),
    phone: z.string().optional(),
    password: z.string().optional(),
    branch: z.coerce.number().min(1, "Branch is required"),
    role: z.enum(["technician", "service_coordinator"]).default("technician"),
    years_of_experience: z.coerce.number().min(0).default(0),
    bio: z.string().optional(),
    skill_ids: z.array(z.number()).default([]),
});

export default function EditTechnicianPage() {
    const router = useRouter();
    const params = useParams();
    const id = Number(params?.id);
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [profilePictureFile, setProfilePictureFile] = useState<File | null>(null);
    const [profilePicturePreview, setProfilePicturePreview] = useState<string | null>(null);

    const { data: technician, isLoading: isLoadingTechnician } = useQuery({
        queryKey: ["technician", id],
        queryFn: () => techniciansApi.get(id),
        enabled: !!id,
    });

    const { data: skills, isLoading: isLoadingSkills } = useQuery({
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
            role: "technician" as "technician" | "service_coordinator",
            years_of_experience: 0,
            bio: "",
            skill_ids: [],
        },
    });

    useEffect(() => {
        if (technician) {
            form.reset({
                first_name: technician.user_details?.first_name || "",
                last_name: technician.user_details?.last_name || "",
                email: technician.user_details?.email || "",
                phone: technician.user_details?.phone || "",
                password: "", // Don't pre-fill password
                branch: technician.user_details?.branch || 0,
                // role might come as string from backend, need to cast or map
                role: (technician.user_details?.role === "service_coordinator" ? "service_coordinator" : "technician"),
                years_of_experience: technician.years_of_experience,
                bio: technician.bio || "",
                skill_ids: technician.skills.map(s => s.id),
            });
        }
    }, [technician, form]);

    async function onSubmit(values: z.infer<typeof formSchema>) {
        if (!id) return;
        setIsSubmitting(true);
        try {
            // Remove password if empty to avoid updating it

            const updateData: Partial<z.infer<typeof formSchema>> = {
                ...values,
                phone: values.phone || undefined,
                bio: values.bio || undefined,
            };
            if (!updateData.password) {
                delete updateData.password;
            }

            // Don't send email if it hasn't changed (to avoid unique validation issues)
            if (technician && updateData.email === technician.user_details?.email) {
                delete updateData.email;
            }

            // If profile picture file is selected, use FormData
            if (profilePictureFile) {
                const formData = new FormData();
                Object.entries(updateData).forEach(([key, value]) => {
                    if (value !== null && value !== undefined) {
                        if (key === 'skill_ids') {
                            // Append array items
                            (value as number[]).forEach(skillId => {
                                formData.append('skill_ids', skillId.toString());
                            });
                        } else {
                            formData.append(key, value.toString());
                        }
                    }
                });
                formData.append('profile_picture', profilePictureFile);


                await techniciansApi.update(id, formData);
            } else {
                await techniciansApi.update(id, updateData);
            }

            // Invalidate queries to refresh data
            queryClient.invalidateQueries({ queryKey: ["technician", id] });
            queryClient.invalidateQueries({ queryKey: ["technicians"] });

            toast({
                title: "Technician updated successfully",
                description: `Technician ${values.first_name} ${values.last_name} has been updated.`,
            });
            router.push(`/technicians/${id}`);
        } catch (error) {
            toast({
                title: "Error updating technician",
                description: getApiErrorMessage(error, "There was a problem updating the technician."),
                variant: "destructive",
            });
        } finally {
            setIsSubmitting(false);
        }
    }

    if (isLoadingTechnician || isLoadingSkills) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (!technician) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
                <h2 className="text-xl font-semibold">Technician not found</h2>
                <Button asChild>
                    <Link href="/technicians">Go Back</Link>
                </Button>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" asChild>
                    <Link href={`/technicians/${id}`}>
                        <ArrowLeft className="h-4 w-4" />
                    </Link>
                </Button>
                <div>
                    <h1 className="text-xl font-semibold tracking-tight">Edit Technician</h1>
                    <p className="text-xs text-muted-foreground">Keep account, HR staff, and technician details aligned</p>
                </div>
            </div>

            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 bg-card p-4 rounded-lg border shadow-sm">
                    {/* Profile Picture Upload */}
                    <div className="flex items-center gap-6 p-4 border rounded-lg bg-muted/30">
                        <div className="flex-shrink-0">
                            <Avatar className="h-24 w-24 border-4 border-background shadow-lg">
                                <AvatarImage
                                    src={profilePicturePreview || technician?.user_details?.profile_picture}
                                    alt="Profile"
                                />
                                <AvatarFallback className="text-lg">
                                    {technician?.user_details?.first_name?.[0]}
                                    {technician?.user_details?.last_name?.[0]}
                                </AvatarFallback>
                            </Avatar>
                        </div>
                        <div className="flex-1 space-y-2">
                            <Label htmlFor="profile_picture" className="text-sm font-semibold">
                                Profile Picture
                            </Label>
                            <Input
                                id="profile_picture"
                                type="file"
                                accept="image/*"
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                        setProfilePictureFile(file);
                                        // Create preview
                                        const reader = new FileReader();
                                        reader.onloadend = () => {
                                            setProfilePicturePreview(reader.result as string);
                                        };
                                        reader.readAsDataURL(file);
                                    }
                                }}
                                className="cursor-pointer"
                            />
                            <p className="text-xs text-muted-foreground">
                                Upload a new profile picture (JPG, PNG, max 5MB)
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                        <FormField
                            control={form.control}
                            name="email"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Email</FormLabel>
                                    <FormControl>
                                        <Input placeholder="john.doe@example.com" {...field} />
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
                                    <FormLabel>New Password</FormLabel>
                                    <FormControl>
                                        <Input type="password" placeholder="Leave blank to keep current" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="years_of_experience"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Years of Experience</FormLabel>
                                    <FormControl>
                                        <Input
                                            type="number"
                                            placeholder="5"
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
                            name="skill_ids"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Skills</FormLabel>
                                    <FormControl>
                                        <Combobox
                                            placeholder="Select skills..."
                                            options={skills?.map((skill: Skill) => ({
                                                value: skill.id.toString(),
                                                label: skill.name,
                                            })) || []}
                                            value={(field.value || []).map(String)}
                                            onChange={(selectedValues: string[]) =>
                                                field.onChange(selectedValues.map(Number))
                                            }
                                            multiple
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>
                    <FormField
                        control={form.control}
                        name="bio"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Bio</FormLabel>
                                <FormControl>
                                    <Textarea
                                        placeholder="Tell us about the technician's background and expertise..."
                                        className="resize-none"
                                        {...field}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <div className="flex justify-end gap-4">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => router.back()}
                            disabled={isSubmitting}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Update Technician
                        </Button>
                    </div>
                </form>
            </Form>
        </div>
    );
}
