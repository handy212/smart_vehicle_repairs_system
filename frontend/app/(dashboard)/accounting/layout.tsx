export default function AccountingLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="flex flex-col h-full">
            {/* Optional: Accounting-specific sub-header could go here */}
            {children}
        </div>
    );
}
