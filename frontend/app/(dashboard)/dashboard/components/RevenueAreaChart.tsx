"use client";

import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Dot } from "recharts";
import { memo, useMemo } from "react";
import { TrendingUp, TrendingDown, DollarSign, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { format, parseISO, isToday, isYesterday } from "date-fns";
import { useCurrency } from "@/lib/hooks/useCurrency";

interface RevenueAreaChartProps {
  data: Array<{ date?: string; period?: string; revenue: number }>;
}

const RevenueAreaChart = memo(function RevenueAreaChart({ data }: RevenueAreaChartProps) {
  const { formatCurrency: formatMoney, currency } = useCurrency();
  // Process data to ensure all 7 days are represented and add day labels
  const processedData = useMemo(() => {
    if (!data || data.length === 0) return [];

    return data.map(item => {
      const dateStr = item.period || item.date || "";
      const date = parseISO(dateStr);
      let dateLabel = format(date, "MMM d");

      // Add special labels for today and yesterday
      if (isToday(date)) {
        dateLabel = "Today";
      } else if (isYesterday(date)) {
        dateLabel = "Yesterday";
      }

      return {
        ...item,
        date: dateStr,
        dateLabel,
        revenue: item.revenue || 0,
      };
    });
  }, [data]);

  // Calculate statistics
  const stats = useMemo(() => {
    if (processedData.length === 0) {
      return { total: 0, average: 0, change: 0, changePercent: 0, max: 0, min: 0 };
    }

    const revenues = processedData.map(d => d.revenue);
    const total = revenues.reduce((sum, rev) => sum + rev, 0);
    const average = total / revenues.length;
    const max = Math.max(...revenues);
    const min = Math.min(...revenues);

    // Calculate change (compare last day to first day, or last 2 days if available)
    let change = 0;
    let changePercent = 0;

    if (processedData.length >= 2) {
      const firstDay = processedData[0].revenue;
      const lastDay = processedData[processedData.length - 1].revenue;
      change = lastDay - firstDay;
      changePercent = firstDay > 0 ? (change / firstDay) * 100 : 0;
    } else if (processedData.length === 1) {
      change = processedData[0].revenue;
      changePercent = 100;
    }

    return { total, average, change, changePercent, max, min };
  }, [processedData]);

  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[200px] text-muted-foreground">
        <DollarSign className="w-12 h-12 mb-2 opacity-50" />
        <p className="text-sm font-medium">No revenue data available</p>
        <p className="text-xs mt-1">Revenue data for the last 7 days will appear here</p>
      </div>
    );
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const revenue = data.revenue || 0;
      const date = parseISO(data.date);

      // Calculate change from previous day
      const currentIndex = processedData.findIndex(d => d.date === data.date);
      let dayOverDay = null;
      if (currentIndex > 0) {
        const previousRevenue = processedData[currentIndex - 1].revenue;
        const change = revenue - previousRevenue;
        const changePct = previousRevenue > 0 ? ((change / previousRevenue) * 100) : 0;
        dayOverDay = { change, changePct };
      }

      return (
        <div className="bg-card border border-border rounded-lg shadow-lg p-3">
          <p className="font-semibold text-sm text-foreground mb-2">
            {data.dateLabel || format(date, "MMM d, yyyy")}
          </p>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">
              Revenue: <span className="font-semibold text-foreground">
                {formatMoney(revenue)}
              </span>
            </p>
            {dayOverDay && (
              <p className={`text-xs flex items-center gap-1 ${dayOverDay.change >= 0
                ? 'text-success'
                : 'text-red-600 dark:text-red-400'
                }`}>
                {dayOverDay.change >= 0 ? (
                  <ArrowUpRight className="w-3 h-3" />
                ) : (
                  <ArrowDownRight className="w-3 h-3" />
                )}
                {dayOverDay.change >= 0 ? '+' : ''}
                {formatMoney(Math.abs(dayOverDay.change), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(currency, '')} ({Math.abs(dayOverDay.changePct).toFixed(1)}%)
              </p>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  const formatCurrency = (value: number) => {
    if (value >= 1000) {
      const currencySymbol = formatMoney(0).replace(/[0-9.,\s]/g, '');
      return `${currencySymbol}${(value / 1000).toFixed(1)}k`;
    }
    return formatMoney(value, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  };

  const CustomDot = (props: any) => {
    const { cx, cy, payload } = props;
    // Highlight today with a larger dot
    const date = parseISO(payload.date);
    const isTodayDate = isToday(date);

    return (
      <Dot
        cx={cx}
        cy={cy}
        r={isTodayDate ? 6 : 4}
        fill="#3B82F6"
        stroke={isTodayDate ? "#1E40AF" : "#3B82F6"}
        strokeWidth={isTodayDate ? 2 : 1}
      />
    );
  };

  return (
    <div className="space-y-4">
      {/* Summary Statistics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* <div className="p-3 rounded-lg bg-primary/10 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800">
          <p className="text-xs text-primary dark:text-primary mb-1">Total Revenue</p>
          <p className="text-lg font-bold text-orange-900 dark:text-orange-100">
            ${parseFloat(String(stats.total)).toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </p>
        </div>
        
        <div className="p-3 rounded-lg bg-success/10 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
          <p className="text-xs text-success mb-1">Average Daily</p>
          <p className="text-lg font-bold text-green-900 dark:text-green-100">
            ${parseFloat(String(stats.average)).toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </p>
        </div>
        
        <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
          <p className="text-xs text-purple-600 dark:text-purple-400 mb-1">Peak Day</p>
          <p className="text-lg font-bold text-purple-900 dark:text-purple-100">
            ${parseFloat(String(stats.max)).toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </p>
        </div>
        
        <div className={`p-3 rounded-lg border ${
          stats.change >= 0
            ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'
            : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
        }`}>
          <p className={`text-xs mb-1 flex items-center gap-1 ${
            stats.change >= 0
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-red-600 dark:text-red-400'
          }`}>
            {stats.change >= 0 ? (
              <TrendingUp className="w-3 h-3" />
            ) : (
              <TrendingDown className="w-3 h-3" />
            )}
            Trend
          </p>
          <p className={`text-lg font-bold ${
            stats.change >= 0
              ? 'text-emerald-900 dark:text-emerald-100'
              : 'text-red-900 dark:text-red-100'
          }`}>
            {stats.change >= 0 ? '+' : ''}
            ${Math.abs(stats.change).toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </p>
          <p className={`text-xs ${
            stats.change >= 0
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-red-600 dark:text-red-400'
          }`}>
            {stats.changePercent >= 0 ? '+' : ''}{stats.changePercent.toFixed(1)}%
          </p>
        </div> */}
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart
          data={processedData}
          margin={{ top: 10, right: 10, left: 0, bottom: 5 }}
        >
          <defs>
            <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
          <XAxis
            dataKey="dateLabel"
            tick={{ fill: 'currentColor', fontSize: 12 }}
            className="text-xs"
          />
          <YAxis
            tickFormatter={formatCurrency}
            tick={{ fill: 'currentColor', fontSize: 12 }}
            className="text-xs"
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="revenue"
            stroke="#3B82F6"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#colorRevenue)"
            dot={<CustomDot />}
            activeDot={{ r: 6, fill: "#1E40AF", stroke: "#3B82F6", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
});

export default RevenueAreaChart;

