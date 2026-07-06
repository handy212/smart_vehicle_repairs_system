import { redirect } from "next/navigation";

export default function LegacyNewBundlePage() {
  redirect("/inventory/products/new/bundle");
}
