import { redirect } from "next/navigation";

export default function NewProformaRedirect() {
  redirect("/billing/invoices/new?type=proforma");
}
