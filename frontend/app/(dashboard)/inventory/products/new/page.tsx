import { redirect } from "next/navigation";

export default function LegacyProductTypePickerPage() {
  redirect("/inventory?createProduct=1");
}
