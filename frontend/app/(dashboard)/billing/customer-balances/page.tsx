import { redirect } from "next/navigation";

export default function CustomerBalancesRedirect() {
  redirect("/billing/receivables?tab=balances");
}
