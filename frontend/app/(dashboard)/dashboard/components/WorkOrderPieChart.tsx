"use client";

import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import { memo, useMemo } from "react";

interface WorkOrderPieChartProps {
  data: Array<{ status: string; count: number }>;
}

const COLORS = ["#f97316", "#fbbf24", "#22c55e", "#3b82f6", "#ef4444"];

const STATUS_LABELS: Record<string, string> = {
  inspection: "Inspection",
  repair: "Repair",
  completed: "Completed",
  in_progress: "In Progress",
  diagnosis: "Diagnosis",
};

const WorkOrderPieChart = memo(function WorkOrderPieChart({ data }: WorkOrderPieChartProps) {
  const processedData = useMemo(() => {
    if (!data || data.length === 0) return [];
    
    // Group common statuses to match the image categories if needed, or just use top 3-4
    return data
      .map((item, index) => ({
        name: STATUS_LABELS[item.status.toLowerCase()] || item.status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        value: item.count,
        color: COLORS[index % COLORS.length]
      }))
      .sort((a, b) => b.value - a.value);
  }, [data]);

  const totalCount = useMemo(() => {
    return processedData.reduce((sum, item) => sum + item.value, 0);
  }, [processedData]);

  if (!data || data.length === 0) {
    return <div className="h-[200px] flex items-center justify-center text-muted-foreground">No distribution data</div>;
  }

  return (
    <div className="precision-card p-6 h-full flex flex-col">
      <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400 mb-6">Workload Distribution</h3>
      
      <div className="flex items-center justify-between w-full flex-1 min-h-[200px]">
        <div className="relative w-1/2 h-full min-h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={processedData}
                innerRadius={60}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
                stroke="none"
                animationDuration={1000}
              >
                {processedData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip 
                 contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-4xl font-bold tracking-tighter text-foreground">{totalCount}</span>
          </div>
        </div>

        <div className="flex flex-col gap-3 pr-4 w-1/2">
          {processedData.slice(0, 4).map((item, index) => (
            <div key={index} className="flex items-center justify-between group">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: item.color }} />
                <span className="text-xs font-medium text-gray-500 group-hover:text-foreground transition-colors">
                  {item.name}
                </span>
              </div>
              <span className="text-xs font-bold text-foreground">({item.value})</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

export default WorkOrderPieChart;
