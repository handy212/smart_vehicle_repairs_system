import { redirect } from "next/navigation";

export default function ApDueRedirect() {
  redirect("/billing/payables?tab=due");
}
