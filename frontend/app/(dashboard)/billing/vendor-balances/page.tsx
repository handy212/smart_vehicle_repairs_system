import { redirect } from "next/navigation";

export default function VendorBalancesRedirect() {
  redirect("/billing/payables?tab=balances");
}
