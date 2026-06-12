import type { Customer } from "@/lib/api/customers";

type CustomerLike = Partial<
  Pick<
    Customer,
    | "id"
    | "full_name"
    | "company_name"
    | "email"
    | "phone"
    | "customer_number"
    | "customer_type"
  >
> & {
  user?: Customer["user"];
};

type WorkOrderCustomerLike = {
  customer_name?: string;
  customer?: number | CustomerLike | null;
};

export function getCustomerContactName(c?: CustomerLike | null): string | null {
  if (!c) return null;

  const fullName = c.full_name?.trim();
  if (fullName) return fullName;

  const fromUser = [c.user?.first_name, c.user?.last_name].filter(Boolean).join(" ").trim();
  return fromUser || null;
}

export function getCustomerDisplayName(c?: CustomerLike | null): string {
  if (!c) return "Customer";

  const companyName = c.company_name?.trim();
  if (companyName) return companyName;

  const contactName = getCustomerContactName(c);
  if (contactName) return contactName;

  return c.email?.trim() || (c.id ? `Customer #${c.id}` : "Customer");
}

/** Business-first label for selectors and compact customer references. */
export function getCustomerSelectLabel(c: CustomerLike): string {
  return getCustomerDisplayName(c);
}

export function getWorkOrderCustomerDisplayName(workOrder?: WorkOrderCustomerLike | null): string {
  if (!workOrder) return "Customer";

  if (
    typeof workOrder.customer === "object" &&
    workOrder.customer !== null
  ) {
    const nestedName = getCustomerDisplayName(workOrder.customer);
    if (nestedName && nestedName !== "Customer") {
      return nestedName;
    }
  }

  return workOrder.customer_name?.trim() || "Customer";
}
