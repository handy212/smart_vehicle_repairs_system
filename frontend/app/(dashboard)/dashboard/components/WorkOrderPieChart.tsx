"use client";

import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";
import { memo, useMemo } from "react";
import { CheckCircle2, Clock, AlertCircle, PlayCircle, PauseCircle, FileCheck, DollarSign } from "lucide-react";

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

// Status groupings for summary
const getStatusGroup = (status: string): string => {
  if (['completed', 'invoiced', 'closed'].includes(status)) return 'completed';
  if (['draft', 'inspection', 'intake', 'diagnosis', 'awaiting_approval'].includes(status)) return 'pending';
  if (['approved', 'in_progress', 'assigned'].includes(status)) return 'active';
  if (['paused', 'quality_check', 'additional_work_found'].includes(status)) return 'attention';
  return 'other';
};

const WorkOrderPieChart = memo(function WorkOrderPieChart({ data }: WorkOrderPieChartProps) {
  // Process and enhance data
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
          group: getStatusGroup(statusKey),
        };
      })
      .sort((a, b) => b.count - a.count); // Sort by count descending
  }, [data]);

  const totalCount = useMemo(() => {
    return processedData.reduce((sum, item) => sum + item.count, 0);
  }, [processedData]);

  // Calculate summary by groups
  const summary = useMemo(() => {
    const groups = {
      active: { count: 0, label: 'Active', icon: PlayCircle, color: '#3B82F6' },
      pending: { count: 0, label: 'Pending', icon: Clock, color: '#F59E0B' },
      attention: { count: 0, label: 'Needs Attention', icon: AlertCircle, color: '#EF4444' },
      completed: { count: 0, label: 'Completed', icon: CheckCircle2, color: '#10B981' },
    };

    processedData.forEach(item => {
      const group = groups[item.group as keyof typeof groups];
      if (group) {
        group.count += item.count;
      }
    });

    return Object.values(groups).filter(g => g.count > 0);
  }, [processedData]);

  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
        <FileCheck className="w-12 h-12 mb-2 opacity-50" />
        <p className="text-sm font-medium">No work order data available</p>
        <p className="text-xs mt-1">Work orders created in the last 30 days will appear here</p>
      </div>
    );
  }

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const percentage = totalCount > 0 ? ((data.count / totalCount) * 100).toFixed(1) : 0;
      return (
        <div className="bg-card border border-border rounded-lg shadow-lg p-3">
          <p className="font-semibold text-sm text-foreground mb-1">
            {data.label}
          </p>
          <p className="text-xs text-muted-foreground">
            Count: <span className="font-semibold text-foreground">{data.count}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            Percentage: <span className="font-semibold text-foreground">{percentage}%</span>
          </p>
        </div>
      );
    }
    return null;
  };

  const CustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
    if (percent < 0.05) return null; // Don't show labels for slices smaller than 5%
    
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
      <text
        x={x}
        y={y}
        fill="white"
        textAnchor={x > cx ? "start" : "end"}
        dominantBaseline="central"
        className="text-xs font-semibold"
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  return (
    <div className="space-y-4">
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={processedData}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={CustomLabel}
            outerRadius={100}
            innerRadius={40}
            paddingAngle={2}
            dataKey="count"
          >
            {processedData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="space-y-2 max-h-[120px] overflow-y-auto">
        <div className="grid grid-cols-2 gap-2 text-xs">
          {processedData.map((item, index) => {
            const percentage = totalCount > 0 ? ((item.count / totalCount) * 100).toFixed(1) : 0;
            return (
              <div
                key={index}
                className="flex items-center gap-2 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: item.color }}
                />
                <span className="flex-1 text-card-foreground truncate">
                  {item.label}
                </span>
                <span className="font-semibold text-foreground">
                  {item.count}
                </span>
                <span className="text-muted-foreground text-xs">
                  ({percentage}%)
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Summary Cards */}
      {summary.length > 0 && (
        <div className="pt-4 border-t border-border">
          <div className="grid grid-cols-2 gap-3">
            {summary.map((group, index) => {
              const Icon = group.icon;
              const percentage = totalCount > 0 ? ((group.count / totalCount) * 100).toFixed(0) : 0;
              return (
                <div
                  key={index}
                  className="flex items-center gap-2 p-2 rounded-lg bg-muted"
                >
                  <div
                    className="p-1.5 rounded"
                    style={{ backgroundColor: `${group.color}20` }}
                  >
                    <Icon className="w-4 h-4" style={{ color: group.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground truncate">
                      {group.label}
                    </p>
                    <p className="text-sm font-semibold text-foreground">
                      {group.count} <span className="text-xs font-normal text-gray-500">({percentage}%)</span>
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
});

export default WorkOrderPieChart;

