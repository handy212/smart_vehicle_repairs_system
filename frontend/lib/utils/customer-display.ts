import type { Customer } from "@/lib/api/customers";

/** Label for customer pickers (matches list APIs: full_name, user, company). */
export function getCustomerSelectLabel(c: Customer): string {
  const fromUser = [c.user?.first_name, c.user?.last_name].filter(Boolean).join(" ").trim();
  const name = (c.full_name && c.full_name.trim()) || fromUser;
  if (c.company_name?.trim()) {
    return name ? `${name} (${c.company_name})` : c.company_name;
  }
  return name || c.email?.trim() || `Customer #${c.id}`;
}
