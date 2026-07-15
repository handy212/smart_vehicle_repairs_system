import { Suspense } from 'react';
import { unstable_cache } from 'next/cache';
import { FeedbackForm } from '@/components/feedback/FeedbackForm';
import { Loader2 } from 'lucide-react';
import { adminApi, type SystemSetting } from '@/lib/api/admin';

const getCachedPublicBranding = unstable_cache(
    async () => {
        try {
            return await adminApi.settings.publicBranding();
        } catch {
            return [] as SystemSetting[];
        }
    },
    ['public-feedback-branding'],
    { revalidate: 300 }
);

async function getBranding() {
    const settings = await getCachedPublicBranding();
    const getSetting = (key: string): string | null => {
        const setting = settings.find((s) => s.key === key);
        return setting?.value && setting.value.trim() !== "" ? setting.value : null;
    };
    return {
        site_name: getSetting("site_name") || "Smart Repairs",
        company_name: getSetting("company_name") || "Smart Vehicle Repairs",
    };
}

export async function generateMetadata() {
    const branding = await getBranding();
    return {
        title: `Give Feedback - ${branding.site_name}`,
        description: `Share your thoughts and suggestions with ${branding.company_name}.`,
    };
}

export default async function FeedbackPage() {
    const branding = await getBranding();

    return (
        <div className="container mx-auto px-4 py-12 md:py-20">
            <div className="w-full space-y-8">
                <div className="text-center space-y-2">
                    <h1 className="text-4xl font-bold tracking-tight">We Value Your Voice</h1>
                    <p className="text-xl text-muted-foreground">
                        Thank you for choosing {branding.company_name}. Please let us know how we can serve you better.
                    </p>
                </div>

                <Suspense fallback={
                    <div className="flex flex-col items-center justify-center min-h-[400px]">
                        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
                        <p className="text-muted-foreground">Loading form...</p>
                    </div>
                }>
                    <FeedbackForm />
                </Suspense>
            </div>
        </div>
    );
}
