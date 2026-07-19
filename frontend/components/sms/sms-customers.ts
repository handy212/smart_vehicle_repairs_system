import { customersApi, type Customer } from "@/lib/api/customers";

export interface SmsCustomer {
  id: number;
  user_id?: number;
  company_name: string;
  full_name: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  customer_type?: string;
}

export function mapCustomerForSms(customer: Customer): SmsCustomer {
  const phone =
    customer.phone ||
    customer.user?.phone ||
    customer.alternative_phone ||
    customer.company_phone ||
    "";
  const nameParts = customer.full_name?.trim().split(/\s+/) ?? [];
  return {
    id: customer.id,
    user_id:
      (customer as Customer & { user_id?: number }).user_id ?? customer.user?.id,
    company_name: customer.company_name || "",
    full_name: customer.full_name || "",
    first_name: customer.user?.first_name || nameParts[0] || "",
    last_name:
      customer.user?.last_name ||
      (nameParts.length > 1 ? nameParts.slice(1).join(" ") : ""),
    email: customer.email || customer.user?.email || "",
    phone,
    customer_type: customer.customer_type,
  };
}

export async function searchCustomersForSms(params: {
  search?: string;
  customer_type?: string;
  page?: number;
  page_size?: number;
}) {
  const data = await customersApi.list({
    search: params.search || undefined,
    customer_type: params.customer_type,
    status: "active",
    page: params.page ?? 1,
    page_size: params.page_size ?? 100,
    ordering: "company_name",
  });
  return {
    count: data.count ?? 0,
    next: data.next,
    results: (data.results ?? []).map(mapCustomerForSms),
  };
}
