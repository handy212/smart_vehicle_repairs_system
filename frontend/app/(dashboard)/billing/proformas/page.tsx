import { redirect } from "next/navigation";

export default function ProformasRedirect() {
  redirect("/billing/invoices?status=proforma");
}
