import { AccountingReportsSubNav } from "./components/AccountingReportsSubNav";

export default function AccountingReportsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div>
      <AccountingReportsSubNav />
      {children}
    </div>
  );
}
