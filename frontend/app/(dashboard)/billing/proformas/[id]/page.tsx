import { redirect } from "next/navigation";

export default async function ProformaDetailRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/billing/invoices/${id}`);
}
