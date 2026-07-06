import { customersApi } from "@/lib/api/customers";

export interface DuplicateCustomerMatch {
  customerId: number;
  displayName: string;
  email: string;
}

type EmailCheckResponse = Awaited<ReturnType<typeof customersApi.checkEmail>>;

export function getDuplicateCustomerDisplayName(
  emailCheck: EmailCheckResponse
): string {
  const customer = emailCheck.customer as
    | { company_name?: string; customer_number?: string; user?: { first_name?: string; last_name?: string } }
    | undefined;
  const user = emailCheck.user as
    | { first_name?: string; last_name?: string; email?: string }
    | undefined;

  if (customer) {
    return (
      customer.company_name ||
      [customer.user?.first_name, customer.user?.last_name].filter(Boolean).join(" ") ||
      customer.customer_number ||
      "Existing customer"
    );
  }
  if (user) {
    const name = [user.first_name, user.last_name].filter(Boolean).join(" ");
    return name || user.email || "Existing customer";
  }
  return "Existing customer";
}

export async function findDuplicateCustomerByEmail(
  email: string
): Promise<DuplicateCustomerMatch | null> {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) return null;

  try {
    const emailCheck = await customersApi.checkEmail(trimmed);
    if (emailCheck.success && emailCheck.exists && emailCheck.customer_id) {
      return {
        customerId: emailCheck.customer_id,
        displayName: getDuplicateCustomerDisplayName(emailCheck),
        email: trimmed,
      };
    }
  } catch {
    // Non-blocking — caller can proceed with create if check fails
  }
  return null;
}
