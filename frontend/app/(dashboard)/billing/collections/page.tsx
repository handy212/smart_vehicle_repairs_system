import { redirect } from "next/navigation";

export default function CollectionsRedirect() {
  redirect("/billing/receivables?tab=overdue");
}
