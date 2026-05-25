interface AccountingReportPrintHeaderProps {
  title: string;
  dateInfo?: string;
}

/** Visible only when printing (see styles/print.css). */
export function AccountingReportPrintHeader({
  title,
  dateInfo,
}: AccountingReportPrintHeaderProps) {
  return (
    <div className="print-only mb-4 hidden print:block print-header">
      <h1 className="print-header-title">{title}</h1>
      {dateInfo ? <p className="print-header-subtitle">{dateInfo}</p> : null}
    </div>
  );
}
