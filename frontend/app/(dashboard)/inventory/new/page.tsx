import { redirect } from "next/navigation";

export default function LegacyNewPartPage() {
  redirect("/inventory/products/new");
}
