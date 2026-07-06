export type BrandingSetting = {
  key: string;
  value?: string | null;
  updated_at?: string | null;
};

export function pickBrandingSetting(
  settings: BrandingSetting[] | undefined,
  key: string,
): BrandingSetting | undefined {
  return settings?.find((setting) => setting.key === key);
}

export function brandingSettingValue(
  settings: BrandingSetting[] | undefined,
  key: string,
  fallback = "",
): string {
  const value = pickBrandingSetting(settings, key)?.value;
  return value?.trim() ? value.trim() : fallback;
}

export function brandingMediaVersion(
  settings: BrandingSetting[] | undefined,
  key: string,
): number | undefined {
  const updatedAt = pickBrandingSetting(settings, key)?.updated_at;
  return updatedAt ? new Date(updatedAt).getTime() : undefined;
}

export function withCacheBuster(url: string, version?: number): string {
  if (!url || !version) return url;
  return `${url}${url.includes("?") ? "&" : "?"}v=${version}`;
}
