"use client";

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from "recharts";
import { memo, useMemo } from "react";
import { CreditCard, Wallet, Banknote, Building2, Smartphone, DollarSign } from "lucide-react";
import { useCurrency } from "@/lib/hooks/useCurrency";

interface PaymentMethodBarChartProps {
  data: Array<{ method: string; total: number; count?: number }>;
}

// Payment method colors and icons
const PAYMENT_METHOD_CONFIG: Record<string, { color: string; label: string; icon: any }> = {
  cash: { color: "#10B981", label: "Cash", icon: Banknote },
  check: { color: "#3B82F6", label: "Check", icon: Building2 },
  credit_card: { color: "#8B5CF6", label: "Credit Card", icon: CreditCard },
  debit_card: { color: "#06B6D4", label: "Debit Card", icon: CreditCard },
  ach: { color: "#6366F1", label: "ACH/Bank Transfer", icon: Building2 },
  bank_transfer: { color: "#6366F1", label: "Bank Transfer", icon: Building2 },
  wire: { color: "#6366F1", label: "Wire Transfer", icon: Building2 },
  paypal: { color: "#F59E0B", label: "PayPal", icon: Smartphone },
  venmo: { color: "#F59E0B", label: "Venmo", icon: Smartphone },
  zelle: { color: "#F59E0B", label: "Zelle", icon: Smartphone },
  mtn_momo: { color: "#F59E0B", label: "MTN Mobile Money", icon: Smartphone },
  vodafone_cash: { color: "#F59E0B", label: "Vodafone Cash", icon: Smartphone },
  airteltigo_money: { color: "#F59E0B", label: "AirtelTigo Money", icon: Smartphone },
  hubtel_card: { color: "#8B5CF6", label: "Hubtel Card", icon: CreditCard },
  online: { color: "#F59E0B", label: "Online Payment", icon: Smartphone },
  other: { color: "#94A3B8", label: "Other", icon: DollarSign },
};

const PaymentMethodBarChart = memo(function PaymentMethodBarChart({
  data,
}: PaymentMethodBarChartProps) {
  const { formatCurrency: formatMoney } = useCurrency();
  // Process and enhance data
  const processedData = useMemo(() => {
    if (!data || data.length === 0) return [];

    return data
      .map(item => {
        const methodKey = item.method.toLowerCase().replace(/\s+/g, '_');
        const config = PAYMENT_METHOD_CONFIG[methodKey] || PAYMENT_METHOD_CONFIG.other;
        return {
          ...item,
          method: methodKey,
          label: config.label,
          color: config.color,
          icon: config.icon,
        };
      })
      .sort((a, b) => b.total - a.total); // Sort by total descending
  }, [data]);

  const totalRevenue = useMemo(() => {
    return processedData.reduce((sum, item) => sum + item.total, 0);
  }, [processedData]);

  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
        <DollarSign className="w-12 h-12 mb-2 opacity-50" />
        <p className="text-sm font-medium">No payment data available</p>
        <p className="text-xs mt-1">Payment data will appear here when available</p>
      </div>
    );
  }

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const percentage = totalRevenue > 0 ? ((data.total / totalRevenue) * 100).toFixed(1) : 0;
      return (
        <div className="bg-card border border-border rounded-lg shadow-lg p-3">
          <p className="font-semibold text-sm text-foreground mb-2 flex items-center gap-2">
            <data.icon className="w-4 h-4" style={{ color: data.color }} />
            {data.label}
          </p>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">
              Revenue: <span className="font-semibold text-foreground">
                {formatMoney(data.total)}
              </span>
            </p>
            {data.count && (
              <p className="text-xs text-muted-foreground">
                Transactions: <span className="font-semibold text-foreground">{data.count}</span>
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Percentage: <span className="font-semibold text-foreground">{percentage}%</span>
            </p>
          </div>
        </div>
      );
    }
    return null;
  };

  const formatCurrency = (value: number) => {
    return formatMoney(value, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  };

  return (
    <div className="space-y-4">
      <ResponsiveContainer width="100%" height={300}>
        <BarChart
          data={processedData}
          margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
          <XAxis
            dataKey="label"
            angle={-45}
            textAnchor="end"
            height={80}
            className="text-xs"
            tick={{ fill: 'currentColor' }}
          />
          <YAxis
            tickFormatter={formatCurrency}
            className="text-xs"
            tick={{ fill: 'currentColor' }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="total" radius={[8, 8, 0, 0]}>
            {processedData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {processedData.map((item, index) => {
          const Icon = item.icon;
          const percentage = totalRevenue > 0 ? ((item.total / totalRevenue) * 100).toFixed(1) : 0;
          return (
            <div
              key={index}
              className="flex items-center gap-2 p-2 rounded-lg bg-muted border border-border"
            >
              <div
                className="p-1.5 rounded flex-shrink-0"
                style={{ backgroundColor: `${item.color}20` }}
              >
                <Icon className="w-4 h-4" style={{ color: item.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground truncate font-medium">
                  {item.label}
                </p>
                <p className="text-sm font-semibold text-foreground">
                  {formatMoney(item.total)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {percentage}% {item.count && `• ${item.count} txns`}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Total Revenue Summary */}
      {totalRevenue > 0 && (
        <div className="pt-3 border-t border-border">
          <div className="flex items-center justify-between p-3 rounded-lg bg-primary/10 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800">
            <div className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-primary dark:text-primary" />
              <span className="text-sm font-medium text-orange-900 dark:text-orange-100">
                Total Revenue
              </span>
            </div>
            <span className="text-lg font-bold text-orange-900 dark:text-orange-100">
              {formatMoney(totalRevenue)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
});

export default PaymentMethodBarChart;

