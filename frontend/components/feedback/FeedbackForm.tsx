'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import ReCAPTCHA from "react-google-recaptcha";
import { useQuery } from "@tanstack/react-query";
import { branchesApi, Branch } from '@/lib/api/branches';
import { feedbackApi } from '@/lib/api/feedback';
import { adminApi } from '@/lib/api/admin';
import { useBranding } from '@/lib/hooks/useBranding';
import { Button } from '@/components/ui/button';
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
    FormDescription,
} from '@/components/ui/form';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, CheckCircle2 } from 'lucide-react';

const formSchema = z.object({
    category: z.enum(['suggestion', 'complaint', 'compliment', 'other']),
    message: z.string().min(10, {
        message: 'Message must be at least 10 characters.',
    }),
    branchId: z.string().optional(),
    isAnonymous: z.boolean(),
    name: z.string().optional(),
    email: z.string().email().optional().or(z.literal('')),
    phone: z.string().optional(),
});

export function FeedbackForm() {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const router = useRouter();
    const searchParams = useSearchParams();
    const branchCode = searchParams.get('branch');
    const recaptchaRef = useRef<ReCAPTCHA>(null);

    const [branches, setBranches] = useState<Branch[]>([]);
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null);

    const { siteName, companyName } = useBranding("public");

    const { data: integrationSettings } = useQuery({
        queryKey: ["settings", "integrations", "public"],
        queryFn: () => adminApi.settings.publicIntegrations(),
        staleTime: 5 * 60 * 1000,
    });

    const isRecaptchaEnabled = integrationSettings?.recaptcha_enabled === 'true' && !!integrationSettings?.recaptcha_site_key;

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            category: 'suggestion',
            message: '',
            isAnonymous: true,
            name: '',
            email: '',
            phone: '',
        },
    });

    const isAnonymous = form.watch('isAnonymous');

    useEffect(() => {
        async function loadBranches() {
            try {
                const branchList = await branchesApi.list();
                setBranches(branchList);

                if (branchCode) {
                    const selectedBranch = branchList.find(b => b.code.toLowerCase() === branchCode.toLowerCase());
                    if (selectedBranch) {
                        form.setValue('branchId', selectedBranch.id.toString());
                    }
                }
            } catch (err) {
                console.error('Failed to load branches', err);
            }
        }
        loadBranches();
    }, [branchCode, form]);

    async function onSubmit(values: z.infer<typeof formSchema>) {
        if (isRecaptchaEnabled && !recaptchaToken) {
            setError("Please complete the reCAPTCHA.");
            return;
        }

        setLoading(true);
        setError(null);
        try {
            await feedbackApi.submitFeedback({
                message: values.message,
                category: values.category,
                branch: values.branchId ? parseInt(values.branchId) : undefined,
                is_anonymous: values.isAnonymous,
                name: values.isAnonymous ? undefined : values.name,
                email: values.isAnonymous ? undefined : values.email,
                phone: values.isAnonymous ? undefined : values.phone,
                recaptcha_token: recaptchaToken || undefined,
            });
            setSuccess(true);

        } catch (err: any) {
            setError(err.response?.data?.detail || 'Something went wrong. Please try again.');
            // Reset reCAPTCHA on error
            recaptchaRef.current?.reset();
            setRecaptchaToken(null);
        } finally {
            setLoading(false);
        }
    }

    if (success) {
        return (
            <Card className="max-w-md mx-auto mt-10 text-center animate-in fade-in duration-500">
                <CardHeader>
                    <div className="flex justify-center mb-4">
                        <CheckCircle2 className="w-16 h-16 text-success" />
                    </div>
                    <CardTitle className="text-2xl">Thank You!</CardTitle>
                    <CardDescription>
                        Your feedback has been received. We appreciate your input to help us improve our services.
                    </CardDescription>
                </CardHeader>
                <CardFooter className="flex justify-center">
                    <Button onClick={() => window.location.reload()}>Submit another response</Button>
                </CardFooter>
            </Card>
        );
    }

    return (
        <Card className="max-w-2xl mx-auto mt-10 shadow-lg border-t-4 border-t-primary">
            <CardHeader>
                <CardTitle className="text-2xl text-center">Digital Suggestion Box</CardTitle>
                <CardDescription className="text-center">
                    Help us improve your experience. Your feedback is important to us.
                </CardDescription>
            </CardHeader>
            <CardContent>
                {error && (
                    <Alert variant="destructive" className="mb-6">
                        <AlertTitle>Error</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <FormField
                                control={form.control}
                                name="category"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Category</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select a category" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                <SelectItem value="suggestion">Suggestion</SelectItem>
                                                <SelectItem value="complaint">Complaint</SelectItem>
                                                <SelectItem value="compliment">Compliment</SelectItem>
                                                <SelectItem value="other">Other</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="branchId"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Branch (Optional)</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select a branch" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {branches.map((branch) => (
                                                    <SelectItem key={branch.id} value={branch.id.toString()}>
                                                        {branch.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <FormField
                            control={form.control}
                            name="message"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Your Message</FormLabel>
                                    <FormControl>
                                        <Textarea
                                            placeholder="Share your thoughts with us..."
                                            className="min-h-[150px] resize-none"
                                            {...field}
                                        />
                                    </FormControl>
                                    <FormDescription>
                                        Maximum 1000 characters.
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="isAnonymous"
                            render={({ field }) => (
                                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 bg-muted/50">
                                    <FormControl>
                                        <Checkbox
                                            checked={field.value}
                                            onCheckedChange={field.onChange}
                                        />
                                    </FormControl>
                                    <div className="space-y-1 leading-none">
                                        <FormLabel>
                                            Submit Anonymously
                                        </FormLabel>
                                        <FormDescription>
                                            Your identity will not be shared with the management.
                                        </FormDescription>
                                    </div>
                                </FormItem>
                            )}
                        />

                        {!isAnonymous && (
                            <div className="space-y-4 pt-4 border-t animate-in slide-in-from-top-2 duration-300">
                                <h3 className="font-medium">Optional Contact Information</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <FormField
                                        control={form.control}
                                        name="name"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Name</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="John Doe" {...field} />
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
                                                    <Input placeholder="john@example.com" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="phone"
                                        render={({ field }) => (
                                            <FormItem className="md:col-span-2">
                                                <FormLabel>Phone Number</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="+1..." {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                            </div>
                        )}

                        {isRecaptchaEnabled && (
                            <div className="flex justify-center py-2">
                                <ReCAPTCHA
                                    ref={recaptchaRef}
                                    sitekey={integrationSettings.recaptcha_site_key!}
                                    onChange={(token) => setRecaptchaToken(token)}
                                    onExpired={() => setRecaptchaToken(null)}
                                />
                            </div>
                        )}

                        <Button type="submit" className="w-full h-12 text-lg" disabled={loading}>
                            {loading && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
                            Submit Feedback
                        </Button>
                    </form>
                </Form>
            </CardContent>
            <CardFooter className="text-xs text-center text-muted-foreground justify-center py-6">
                Powered by {siteName}
            </CardFooter>
        </Card>
    );
}
