/**
 * IDHAM ERP — Executive Interactive Charts Library (ECharts)
 * Unified Dark/Light theme-aware, RTL Arabic formatted interactive visualizations
 * for HR, Projects, Sales, Purchases, Payroll, Custodies, Assets & Financial Reports.
 */
import { ReactNode, useEffect, useMemo, useState } from 'react';
import ReactECharts from 'echarts-for-react';

const CHART_FONT = "'Tajawal', 'Cairo', 'IBM Plex Sans Arabic', 'Inter', system-ui, sans-serif";

export const ROYAL_PALETTE = [
  '#4f46e5', // Royal Indigo
  '#10b981', // Emerald
  '#0ea5e9', // Sky Blue
  '#f59e0b', // Royal Amber/Gold
  '#8b5cf6', // Violet
  '#06b6d4', // Cyan
  '#f43f5e', // Rose
  '#14b8a6', // Teal
];

export function useIsDarkTheme() {
  const [isDark, setIsDark] = useState(() =>
    typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : false,
  );
  useEffect(() => {
    const obs = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return isDark;
}

export type ChartCardAccent = 'indigo' | 'emerald' | 'amber' | 'cyan' | 'purple' | 'rose' | 'slate';

const ACCENT_MAP: Record<ChartCardAccent, { card: string; icon: string }> = {
  indigo: {
    card: 'cyber-card-cyan',
    icon: 'bg-indigo-500/12 text-indigo-600 dark:text-indigo-400 border-indigo-500/25',
  },
  emerald: {
    card: 'cyber-card-emerald',
    icon: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 border-emerald-500/25',
  },
  amber: {
    card: 'cyber-card-amber',
    icon: 'bg-amber-500/12 text-amber-600 dark:text-amber-400 border-amber-500/25',
  },
  cyan: {
    card: 'cyber-card-blue',
    icon: 'bg-sky-500/12 text-sky-600 dark:text-sky-400 border-sky-500/25',
  },
  purple: {
    card: 'cyber-card-purple',
    icon: 'bg-purple-500/12 text-purple-600 dark:text-purple-400 border-purple-500/25',
  },
  rose: {
    card: 'cyber-card-rose',
    icon: 'bg-rose-500/12 text-rose-600 dark:text-rose-400 border-rose-500/25',
  },
  slate: {
    card: 'cyber-card-slate',
    icon: 'bg-slate-500/12 text-slate-600 dark:text-slate-300 border-slate-400/25',
  },
};

export function ExecutiveChartCard({
  title,
  subtitle,
  icon: Icon,
  accent = 'indigo',
  action,
  footer,
  className = '',
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: any;
  accent?: ChartCardAccent;
  action?: ReactNode;
  footer?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const styles = ACCENT_MAP[accent] || ACCENT_MAP.indigo;
  return (
    <div className={`card ${styles.card} p-4 sm:p-5 flex flex-col justify-between animate-fade-in ${className}`}>
      <div className="flex items-start justify-between gap-3 border-b border-slate-100/90 pb-3 dark:border-slate-800/80">
        <div className="flex items-start gap-2.5 min-w-0">
          {Icon && (
            <div className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl border ${styles.icon}`}>
              <Icon className="size-4" />
            </div>
          )}
          <div className="min-w-0">
            <h3 className="text-[15px] font-bold text-slate-900 dark:text-white leading-snug">
              {title}
            </h3>
            {subtitle && (
              <p className="text-xs font-medium text-slate-600 dark:text-slate-300 mt-0.5 leading-snug">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="relative flex-1 pt-2">{children}</div>
      {footer && (
        <div className="mt-3 pt-2.5 border-t border-slate-100/90 dark:border-slate-800/80 text-xs">
          {footer}
        </div>
      )}
    </div>
  );
}

export interface DonutSlice {
  name: string;
  value: number;
  color?: string;
}

export function ExecutiveDonutChart({
  data,
  centerValue,
  centerLabel,
  height = 220,
  unit = '',
  emptyText = 'لا توجد بيانات مسجلة بعد',
}: {
  data: DonutSlice[];
  centerValue?: string;
  centerLabel?: string;
  height?: number;
  unit?: string;
  emptyText?: string;
}) {
  const isDark = useIsDarkTheme();
  const validSlices = useMemo(() => data.filter((d) => Number(d.value) > 0), [data]);
  const total = useMemo(() => validSlices.reduce((s, d) => s + Number(d.value), 0), [validSlices]);

  const option = useMemo(() => {
    const isEmpty = validSlices.length === 0 || total <= 0;
    const textPrimary = isDark ? '#f8fafc' : '#020617';
    const textMuted = isDark ? '#cbd5e1' : '#1e293b';
    const borderCol = isDark ? '#0b1224' : '#ffffff';
    const emptyCol = isDark ? '#1e293b' : '#e2e8f0';

    return {
      tooltip: {
        show: !isEmpty,
        trigger: 'item',
        backgroundColor: isDark ? 'rgba(11, 18, 36, 0.96)' : 'rgba(15, 23, 42, 0.94)',
        borderColor: isDark ? '#334155' : '#1e293b',
        borderWidth: 1,
        padding: [8, 12],
        textStyle: { color: '#f8fafc', fontFamily: CHART_FONT, fontSize: 12 },
        formatter: (p: any) => {
          const formatted = Number(p.value || 0).toLocaleString('en-US', {
            maximumFractionDigits: 2,
          });
          return `<div style="direction:rtl;text-align:right">
            <div style="font-weight:800;margin-bottom:2px">${p.marker} ${p.name}</div>
            <div style="font-family:monospace;font-weight:700">${formatted}${unit ? ` ${unit}` : ''} <span style="color:#94a3b8">(${p.percent}%)</span></div>
          </div>`;
        },
      },
      legend: {
        show: !isEmpty,
        bottom: 0,
        icon: 'circle',
        itemWidth: 8,
        itemHeight: 8,
        itemGap: 12,
        textStyle: { color: textMuted, fontFamily: CHART_FONT, fontSize: 11.5, fontWeight: 700 },
      },
      series: [
        {
          type: 'pie',
          radius: ['54%', '78%'],
          center: ['50%', isEmpty ? '50%' : '43%'],
          avoidLabelOverlap: true,
          itemStyle: {
            borderRadius: 7,
            borderColor: borderCol,
            borderWidth: 2.5,
          },
          label: {
            show: true,
            position: 'center',
            formatter: () => {
              if (isEmpty) return `{empty|0}\n{sub|${emptyText}}`;
              const mainVal =
                centerValue !== undefined
                  ? centerValue
                  : total.toLocaleString('en-US', { maximumFractionDigits: 0 });
              return `{val|${mainVal}}\n{sub|${centerLabel || 'الإجمالي'}}`;
            },
            rich: {
              val: {
                fontSize: 20,
                fontWeight: 900,
                color: textPrimary,
                fontFamily: "'Inter', monospace",
                lineHeight: 26,
              },
              empty: {
                fontSize: 20,
                fontWeight: 900,
                color: textMuted,
                fontFamily: "'Inter', monospace",
                lineHeight: 26,
              },
              sub: {
                fontSize: 10.5,
                fontWeight: 700,
                color: textMuted,
                fontFamily: CHART_FONT,
                padding: [2, 0, 0, 0],
              },
            },
          },
          emphasis: {
            scale: true,
            scaleSize: 5,
          },
          data: isEmpty
            ? [{ value: 1, name: emptyText, itemStyle: { color: emptyCol } }]
            : validSlices.map((s, idx) => ({
                name: s.name,
                value: Number(s.value),
                itemStyle: { color: s.color || ROYAL_PALETTE[idx % ROYAL_PALETTE.length] },
              })),
        },
      ],
    };
  }, [validSlices, total, isDark, centerValue, centerLabel, unit, emptyText]);

  return (
    <div style={{ height }} className="w-full">
      <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge />
    </div>
  );
}

export interface BarSeriesDef {
  name: string;
  data: number[];
  color?: string;
  colorEnd?: string;
  stack?: string;
}

export function ExecutiveBarChart({
  categories,
  series,
  horizontal = false,
  height = 240,
  unit = 'SAR',
  emptyText = 'لا توجد بيانات لعرض الرسم البياني بعد',
}: {
  categories: string[];
  series: BarSeriesDef[];
  horizontal?: boolean;
  height?: number;
  unit?: string;
  emptyText?: string;
}) {
  const isDark = useIsDarkTheme();
  const hasData = useMemo(
    () => categories.length > 0 && series.some((s) => s.data.some((v) => Number(v) !== 0)),
    [categories, series],
  );

  const option = useMemo(() => {
    const axisLabelColor = isDark ? '#cbd5e1' : '#1e293b';
    const splitLineColor = isDark ? 'rgba(148, 163, 184, 0.09)' : '#eef2f7';
    const axisLineColor = isDark ? '#1e293b' : '#cbd5e1';

    const catAxis = {
      type: 'category',
      data: categories.map((c) => (c.length > 18 ? `${c.slice(0, 17)}…` : c)),
      axisLine: { lineStyle: { color: axisLineColor } },
      axisTick: { show: false },
      axisLabel: {
        color: axisLabelColor,
        fontFamily: CHART_FONT,
        fontSize: 11.5,
        fontWeight: 700,
        interval: 0,
      },
    };

    const valAxis = {
      type: 'value',
      splitLine: { lineStyle: { color: splitLineColor, type: 'dashed' } },
      axisLabel: {
        color: axisLabelColor,
        fontFamily: "'Inter', monospace",
        fontSize: 10.5,
        formatter: (val: number) => {
          const abs = Math.abs(val);
          if (abs >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
          if (abs >= 1_000) return `${(val / 1_000).toFixed(0)}K`;
          return String(val);
        },
      },
    };

    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: isDark ? 'rgba(11, 18, 36, 0.96)' : 'rgba(15, 23, 42, 0.94)',
        borderColor: isDark ? '#334155' : '#1e293b',
        borderWidth: 1,
        padding: [10, 14],
        textStyle: { color: '#f8fafc', fontFamily: CHART_FONT, fontSize: 12 },
        formatter: (params: any[]) => {
          if (!Array.isArray(params) || !params.length) return '';
          const title = categories[params[0].dataIndex] || params[0].name;
          const rows = params
            .map((p) => {
              const v = Number(p.value || 0).toLocaleString('en-US', {
                minimumFractionDigits: unit ? 2 : 0,
                maximumFractionDigits: 2,
              });
              return `<div style="display:flex;justify-content:space-between;gap:14px;align-items:center;margin-top:3px">
                <span>${p.marker} ${p.seriesName}</span>
                <strong style="font-family:monospace">${v}${unit ? ` ${unit}` : ''}</strong>
              </div>`;
            })
            .join('');
          return `<div style="direction:rtl;text-align:right;min-width:160px">
            <div style="font-weight:800;margin-bottom:4px;border-bottom:1px solid rgba(255,255,255,0.12);padding-bottom:4px">${title}</div>
            ${rows}
          </div>`;
        },
      },
      legend: {
        show: series.length > 1,
        top: 0,
        icon: 'roundRect',
        itemWidth: 10,
        itemHeight: 8,
        itemGap: 14,
        textStyle: { color: axisLabelColor, fontFamily: CHART_FONT, fontSize: 11, fontWeight: 700 },
      },
      grid: {
        top: series.length > 1 ? 34 : 16,
        bottom: 24,
        left: horizontal ? 12 : 46,
        right: horizontal ? 16 : 14,
        containLabel: horizontal,
      },
      xAxis: horizontal ? valAxis : catAxis,
      yAxis: horizontal ? catAxis : valAxis,
      series: series.map((s, idx) => {
        const baseColor = s.color || ROYAL_PALETTE[idx % ROYAL_PALETTE.length];
        const endColor = s.colorEnd || `${baseColor}bb`;
        return {
          name: s.name,
          type: 'bar',
          stack: s.stack,
          barMaxWidth: horizontal ? 20 : 32,
          data: s.data,
          itemStyle: {
            borderRadius: horizontal ? [0, 6, 6, 0] : [6, 6, 0, 0],
            color: {
              type: 'linear',
              x: horizontal ? 1 : 0,
              y: 0,
              x2: 0,
              y2: horizontal ? 0 : 1,
              colorStops: [
                { offset: 0, color: baseColor },
                { offset: 1, color: endColor },
              ],
            },
          },
          emphasis: {
            focus: 'series',
          },
        };
      }),
    };
  }, [categories, series, horizontal, isDark, unit]);

  return (
    <div style={{ height }} className="relative w-full">
      <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge />
      {!hasData && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded-xl border border-slate-200/80 bg-white/90 px-3.5 py-2 text-xs font-bold text-slate-500 shadow-xs backdrop-blur-xs dark:border-slate-800 dark:bg-[#0b1224]/90 dark:text-slate-400">
            {emptyText}
          </div>
        </div>
      )}
    </div>
  );
}
