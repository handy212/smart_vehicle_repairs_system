import apiClient from "./client";

export interface BrandingSettings {
    site_name: string;
    logo_path: string;
    logo_dark_path: string;
    favicon_path: string;
    login_background: string;
    primary_color: string;
    secondary_color: string;
    [key: string]: string; // Allow other keys
}

export const settingsApi = {
    getPublicBranding: async (): Promise<BrandingSettings[]> => {
        const response = await apiClient.get("/admin/settings/public/branding/");
        return response.data;
    },

    // Helper to convert array response to object for easier usage
    getBrandingMap: async (): Promise<Record<string, string>> => {
        const settings = await settingsApi.getPublicBranding();
        const map: Record<string, string> = {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        settings.forEach((s: any) => {
            map[s.key] = s.value;
        });
        return map;
    }
};
