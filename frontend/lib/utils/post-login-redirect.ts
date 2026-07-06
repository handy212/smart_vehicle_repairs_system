import { shouldUseMobileApp } from "@/lib/utils/device-context";

/** Role-aware landing route after authentication. */
export function getPostLoginPath(
  role: string | undefined | null,
  options?: { useMobileApp?: boolean }
): string {
  if (role === "customer") return "/portal";

  const useMobileApp = options?.useMobileApp ?? shouldUseMobileApp();
  if (role === "technician" && useMobileApp) return "/mobile/dashboard";
  if (role === "technician") return "/dashboard";

  return "/dashboard";
}

/** Roles that may use the /mobile technician shell. */
export function isMobileShellRole(role: string | undefined | null): boolean {
  return role === "technician";
}
