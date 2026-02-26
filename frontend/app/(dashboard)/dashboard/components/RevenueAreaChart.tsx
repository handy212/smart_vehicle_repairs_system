"use client";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Dot } from "recharts";
import { memo, useMemo } from "react";
import { PremiumIcons } from "@/components/ui/icons";
import { format, parseISO, isToday, isYesterday } from "date-fns";
import { useCurrency } from "@/lib/hooks/useCurrency";

interface RevenueAreaChartProps {
  data: Array<{ date?: string; period?: string; revenue: number }>;
}

const RevenueAreaChart = memo(function RevenueAreaChart({ data }: RevenueAreaChartProps) {
  const { formatCurrency: formatMoney, currencySymbol } = useCurrency();

  const processedData = useMemo(() => {
    if (!data || data.length === 0) return [];

    return data.map(item => {
      const dateStr = item.period || item.date || "";
      const date = parseISO(dateStr);
      let dateLabel = format(date, "MMM d");

      if (isToday(date)) dateLabel = "Today";
      else if (isYesterday(date)) dateLabel = "Yesterday";

      return {
        ...item,
        date: dateStr,
        dateLabel,
        revenue: item.revenue || 0,
      };
    });
  }, [data]);

  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[200px] text-muted-foreground bg-white/5 rounded-3xl border border-dashed border-white/10">
        <PremiumIcons.Receipt className="w-10 h-10 mb-2 opacity-20" />
        <p className="text-xs font-bold uppercase tracking-widest opacity-40">No intelligence found</p>
      </div>
    );
  }


  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload;
      return (
        <div className="bg-black/80 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl p-4 min-w-[160px]">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">
            {d.dateLabel}
          </p>
          <div className="flex flex-col gap-1">
            <span className="text-xl font-black text-white tracking-tighter">
              {formatMoney(d.revenue)}
            </span>
            <div className="flex items-center gap-1.5 mt-1">
              <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
              <span className="text-[10px] font-bold text-emerald-500 uppercase">Settled Revenue</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={processedData}
          margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
        >
          <defs>
            <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="colorEmerald" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
          <XAxis
            dataKey="dateLabel"
            axisLine={false}
            tickLine={false}
            tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10, fontWeight: 700 }}
            dy={10}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10, fontWeight: 700 }}
            tickFormatter={(v) => `${currencySymbol}${v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v}`}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 2 }} />
          <Area
            type="monotone"
            dataKey="revenue"
            stroke="var(--color-primary)"
            strokeWidth={4}
            fillOpacity={1}
            fill="url(#colorRevenue)"
            animationDuration={1500}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
});

export default RevenueAreaChart;

