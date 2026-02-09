"use client";

import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";
import { memo, useMemo } from "react";
import { PremiumIcons } from "@/components/ui/icons";

interface WorkOrderPieChartProps {
  data: Array<{ status: string; count: number }>;
}

// Status colors with semantic meaning
const STATUS_COLORS: Record<string, string> = {
  draft: "#94A3B8", // Gray
  inspection: "#F59E0B", // Amber
  intake: "#3B82F6", // Blue
  assigned: "#8B5CF6", // Purple
  diagnosis: "#06B6D4", // Cyan
  awaiting_approval: "#F97316", // Orange
  approved: "#10B981", // Green
  in_progress: "#3B82F6", // Blue
  additional_work_found: "#EF4444", // Red
  paused: "#F59E0B", // Amber
  quality_check: "#8B5CF6", // Purple
  completed: "#10B981", // Green
  invoiced: "#6366F1", // Indigo
  closed: "#64748B", // Slate
};

// Human-readable status labels
const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  inspection: "Inspection",
  intake: "Intake",
  assigned: "Assigned",
  diagnosis: "Diagnosis",
  awaiting_approval: "Awaiting Approval",
  approved: "Approved",
  in_progress: "In Progress",
  additional_work_found: "Additional Work",
  paused: "Paused",
  quality_check: "Quality Check",
  completed: "Completed",
  invoiced: "Invoiced",
  closed: "Closed",
};


const WorkOrderPieChart = memo(function WorkOrderPieChart({ data }: WorkOrderPieChartProps) {
  const processedData = useMemo(() => {
    if (!data || data.length === 0) return [];

    return data
      .map(item => {
        const statusKey = item.status.toLowerCase();
        return {
          ...item,
          status: statusKey,
          label: STATUS_LABELS[statusKey] || item.status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          color: STATUS_COLORS[statusKey] || "#94A3B8",
        };
      })
      .sort((a, b) => b.count - a.count);
  }, [data]);

  const totalCount = useMemo(() => {
    return processedData.reduce((sum, item) => sum + item.count, 0);
  }, [processedData]);

  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[240px] text-muted-foreground bg-white/5 rounded-3xl border border-dashed border-white/10">
        <PremiumIcons.Dashboard className="w-10 h-10 mb-2 opacity-20" />
        <p className="text-xs font-bold uppercase tracking-widest opacity-40">No operational data</p>
      </div>
    );
  }

  return (
    <div className="relative h-[240px] flex items-center justify-center">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={processedData}
            cx="50%"
            cy="50%"
            innerRadius={65}
            outerRadius={85}
            paddingAngle={6}
            dataKey="count"
            stroke="none"
            animationBegin={0}
            animationDuration={1500}
            animationEasing="ease-out"
          >
            {processedData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.color}
                className="hover:opacity-80 transition-opacity cursor-pointer"
                style={{ filter: `drop-shadow(0 0 8px ${entry.color}40)` }}
              />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: 'rgba(0,0,0,0.8)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '16px',
              fontSize: '10px',
              fontWeight: 900,
              textTransform: 'uppercase',
              letterSpacing: '1px'
            }}
          />
        </PieChart>
      </ResponsiveContainer>

      {/* Central Vital Metric */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-3xl font-black text-foreground tracking-tighter">{totalCount}</span>
        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Active Jobs</span>
      </div>

      {/* Simplified Side Legend (Integrated) */}
      <div className="absolute right-0 top-1/2 -translate-y-1/2 hidden xl:flex flex-col gap-2">
        {processedData.slice(0, 4).map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-1.5 h-4 rounded-full" style={{ backgroundColor: item.color }} />
            <span className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
});

export default WorkOrderPieChart;

