"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { qboMappingsApi } from "@/lib/api/qbo-mappings";
import { useQuickBooksConnection } from "@/hooks/useQuickBooksConnection";
import {
  QboSearchableSelect,
  type QboSearchableOption,
} from "@/components/integrations/QboSearchableSelect";

const MANUAL_VALUE = "__manual__";

type Props = {
  accountCode: string;
  accountLabel: string;
  onChange: (next: { accountCode: string; accountLabel: string }) => void;
  disabled?: boolean;
  className?: string;
};

function formatAccountLabel(number: string, name: string) {
  if (number && name) {
    return `${number} · ${name}`;
  }
  return name || number || "Select income account…";
}

export function QboIncomeAccountSelect({
  accountCode,
  accountLabel,
  onChange,
  disabled,
  className,
}: Props) {
  const { isConnected, isApiReady } = useQuickBooksConnection();

  const { data: accountsData, isLoading } = useQuery({
    queryKey: ["qbo", "accounts", "income-picker"],
    queryFn: () => qboMappingsApi.listAccounts(),
    enabled: isConnected && isApiReady,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const incomeAccounts = useMemo(
    () =>
      (accountsData?.accounts ?? []).filter(
        (account) => account.active && account.account_type === "Income",
      ),
    [accountsData?.accounts],
  );

  const options = useMemo<QboSearchableOption[]>(() => {
    const rows: QboSearchableOption[] = incomeAccounts.map((account) => ({
      value: account.id,
      label: formatAccountLabel(account.account_number, account.name),
      searchText: [
        account.account_number,
        account.name,
        account.account_sub_type,
      ]
        .join(" ")
        .toLowerCase(),
      hint: account.account_sub_type || undefined,
    }));

    const code = accountCode.trim();
    const hasMatchingQbo = incomeAccounts.some(
      (account) => account.account_number === code && account.name === accountLabel.trim(),
    );
    if (code && !hasMatchingQbo) {
      rows.unshift({
        value: MANUAL_VALUE,
        label: formatAccountLabel(code, accountLabel.trim() || "Manual entry"),
        searchText: `${code} ${accountLabel}`.toLowerCase(),
        hint: "Current value (not matched to a live QBO account)",
      });
    }

    return rows;
  }, [accountCode, accountLabel, incomeAccounts]);

  const selectedValue = useMemo(() => {
    const code = accountCode.trim();
    const label = accountLabel.trim();
    if (!code) {
      return "";
    }
    const match = incomeAccounts.find(
      (account) => account.account_number === code && (!label || account.name === label),
    );
    if (match) {
      return match.id;
    }
    if (code) {
      return MANUAL_VALUE;
    }
    return "";
  }, [accountCode, accountLabel, incomeAccounts]);

  if (!isConnected || !isApiReady) {
    return null;
  }

  return (
    <QboSearchableSelect
      value={selectedValue}
      onValueChange={(value) => {
        if (!value) {
          onChange({ accountCode: "", accountLabel: "" });
          return;
        }
        if (value === MANUAL_VALUE) {
          return;
        }
        const account = incomeAccounts.find((row) => row.id === value);
        if (!account) {
          return;
        }
        onChange({
          accountCode: account.account_number || "",
          accountLabel: account.name || "",
        });
      }}
      options={options}
      placeholder={isLoading ? "Loading QBO income accounts…" : "Pick from QuickBooks chart…"}
      emptyMessage="No income accounts match your search."
      className={className}
    />
  );
}
