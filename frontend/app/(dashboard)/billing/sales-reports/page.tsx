import { redirect } from "next/navigation";

export default function SalesReportsRedirect() {
  redirect("/billing/receivables?tab=overview");
}
