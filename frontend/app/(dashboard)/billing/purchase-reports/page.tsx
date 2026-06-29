import { redirect } from "next/navigation";

export default function PurchaseReportsRedirect() {
  redirect("/billing/payables?tab=reports");
}
