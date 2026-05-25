/** Role-aware landing route after authentication. */
export function getPostLoginPath(role: string | undefined | null): string {
  if (role === "customer") return "/portal";
  if (role === "technician") return "/mobile/dashboard";
  return "/dashboard";
}
