import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeftRight,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Copy,
  Layers,
  Lock,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react';
import { api } from '../lib/api';
import { date, money } from '../lib/format';
import { ExportMenu } from '../components/ExportMenu';
import { FormModal, PeriodOption, PeriodSelect, REF, usePeriods } from '../components/forms';
import { SearchableSelect } from '../components/SearchableSelect';
import { FieldDef } from '../components/CrudPage';
import { Badge, EmptyState, ErrorState, Field, Loading, Modal, PageHeader, Spinner, Stat, useToast } from '../components/ui';

type PlannerTab = 'plan' | 'matrix' | 'rows';
type FilterTier = 'ALL' | 'FULL' | 'PARTIAL' | 'BENCH' | 'OVER';

const TIER_META: Record<string, { label: string; color: 'green' | 'amber' | 'slate' | 'red' }> = {
  FULL: { label: 'موزع 100%', color: 'green' },
  PARTIAL: { label: 'موزع جزئياً (Bench جزئي)', color: 'amber' },
  BENCH: { label: 'متاح كامل (Bench 0%)', color: 'slate' },
  OVER: { label: 'فائض (>100%)', color: 'red' },
};

const SEGMENT_COLORS = [
  'bg-brand-600',
  'bg-emerald-500',
  'bg-indigo-500',
  'bg-sky-500',
  'bg-violet-500',
  'bg-teal-500',
];

function asArray<T = any>(v: any): T[] {
  if (Array.isArray(v)) return v;
  if (Array.isArray(v?.data)) return v.data;
  if (Array.isArray(v?.rows)) return v.rows;
  return [];
}

function invalidateAllocationDependents(qc: ReturnType<typeof useQueryClient>) {
  const keys = [
    '/assignments',
    '/assignments/monthly-plan',
    '/assignments/monthly-matrix',
    '/assignments/employee-days-report',
    '/assignments/utilization',
    '/utilization',
    '/profitability/employees',
    '/profitability/projects',
    '/profitability/clients',
    '/projects',
    '/dashboard',
  ];
  for (const k of keys) qc.invalidateQueries({ queryKey: [k] });
}

interface PlanLineDraft {
  key: string;
  projectId: string;
  allocationBasis: 'DAYS' | 'PERCENTAGE';
  allocatedDays: string;
  allocationPct: string;
  billingBasis: 'DAILY' | 'MONTHLY' | 'HOURLY';
  billableRate: string;
  billingCurrency: string;
  roleTitle: string;
  costCenterId: string;
  notes: string;
}

function estimateLineRevenue(line: PlanLineDraft, workingDays: number): number {
  const pct = Number(line.allocationPct || 0);
  const days = line.allocatedDays !== '' ? Number(line.allocatedDays || 0) : (pct / 100) * workingDays;
  const rate = Number(line.billableRate || 0);
  if (rate <= 0) return 0;
  if (line.billingBasis === 'DAILY') return Math.round(days * rate * 100) / 100;
  if (line.billingBasis === 'HOURLY') return Math.round(days * 8 * rate * 100) / 100;
  return Math.round((pct / 100) * rate * 100) / 100;
}

/**
 * Interactive multi-project split editor for ONE employee inside ONE selected fiscal month.
 * Automatically clips open-ended historical assignments without rewriting closed months.
 */
function MonthlyEmployeeSplitModal({
  open,
  onClose,
  employee,
  period,
  prevPeriod,
  allProjects,
  servicePrices,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  employee: any | null;
  period: PeriodOption | null;
  prevPeriod: PeriodOption | null;
  allProjects: any[];
  servicePrices: any[];
  onSaved: () => void;
}) {
  const toast = useToast();
  const isClosed = period?.status === 'CLOSED';
  const [workingDays, setWorkingDays] = useState<string>('22');
  const [reason, setReason] = useState<string>('');
  const [lines, setLines] = useState<PlanLineDraft[]>([]);
  const [busy, setBusy] = useState(false);

  const resolveDefaultRate = (projectId: string) => {
    if (!employee) return { rate: '', basis: 'DAILY' as const, currency: 'SAR' };
    const override = servicePrices.find((sp) => !sp.effectiveTo && sp.employeeId === employee.employeeId && sp.projectId === projectId);
    if (override && Number(override.price) > 0) {
      return {
        rate: String(override.price),
        basis: (override.pricingBasis || 'DAILY') as 'DAILY' | 'MONTHLY' | 'HOURLY',
        currency: override.currencyCode || 'SAR',
      };
    }
    const globalPrice = servicePrices.find((sp) => !sp.effectiveTo && sp.employeeId === employee.employeeId && !sp.projectId);
    if (globalPrice && Number(globalPrice.price) > 0) {
      return {
        rate: String(globalPrice.price),
        basis: (globalPrice.pricingBasis || 'DAILY') as 'DAILY' | 'MONTHLY' | 'HOURLY',
        currency: globalPrice.currencyCode || 'SAR',
      };
    }
    return { rate: '1500', basis: 'DAILY' as const, currency: 'SAR' };
  };

  useEffect(() => {
    if (!open || !employee || !period) return;
    const wd = Number(employee.workingDaysInMonth || 22);
    setWorkingDays(String(wd));
    setReason('');
    const mapped: PlanLineDraft[] = (employee.items || []).map((a: any, idx: number) => {
      const daysVal = a.allocatedDays != null ? Number(a.allocatedDays) : Number(((Number(a.allocationPct || 0) / 100) * wd).toFixed(2));
      const pctVal = a.allocationPct != null ? Number(a.allocationPct) : Number(((daysVal / wd) * 100).toFixed(2));
      return {
        key: a.id || `line-${idx}-${Date.now()}`,
        projectId: a.projectId || '',
        allocationBasis: String(a.allocationBasis || '').toUpperCase() === 'PERCENTAGE' ? 'PERCENTAGE' : 'DAYS',
        allocatedDays: String(daysVal),
        allocationPct: String(pctVal),
        billingBasis: (a.billingBasis || a.pricingBasis || 'DAILY') as 'DAILY' | 'MONTHLY' | 'HOURLY',
        billableRate: a.billableRate != null ? String(a.billableRate) : '',
        billingCurrency: a.billingCurrency || 'SAR',
        roleTitle: a.roleTitle || '',
        costCenterId: a.costCenterId || '',
        notes: a.notes || '',
      };
    });
    setLines(mapped);
  }, [open, employee, period]);

  const wDaysNum = Math.max(1, Number(workingDays || 22));
  const totalDays = lines.reduce((s, l) => s + Number(l.allocatedDays || 0), 0);
  const totalPct = lines.reduce((s, l) => s + Number(l.allocationPct || 0), 0);
  const benchDays = Math.max(0, Number((wDaysNum - totalDays).toFixed(2)));
  const benchPct = Math.max(0, Number((100 - totalPct).toFixed(1)));
  const estRevenue = lines.reduce((s, l) => s + estimateLineRevenue(l, wDaysNum), 0);
  const empCost = Number(employee?.monthlyCostBase || 0);
  const normRatio = totalPct > 100 ? 100 / totalPct : 1;
  const estAllocCost = Math.round(empCost * (totalPct / 100) * normRatio * 100) / 100;
  const estProfit = Math.round((estRevenue - estAllocCost) * 100) / 100;

  const projectOptions = useMemo(
    () =>
      allProjects
        .filter((p) => !['COMPLETED', 'CANCELLED'].includes(p.status))
        .map((p) => ({
          value: p.id,
          label: `${p.code} — ${p.nameAr}`,
          subLabel: p.clientName || '',
        })),
    [allProjects],
  );

  const addLine = () => {
    const remainingDays = Math.max(1, Number((wDaysNum - totalDays).toFixed(2)));
    const remainingPct = Math.min(100, Math.max(1, Number(((remainingDays / wDaysNum) * 100).toFixed(2))));
    setLines((prev) => [
      ...prev,
      {
        key: `new-${Date.now()}-${prev.length}`,
        projectId: '',
        allocationBasis: 'DAYS',
        allocatedDays: String(remainingDays > 0 ? remainingDays : wDaysNum),
        allocationPct: String(remainingDays > 0 ? remainingPct : 100),
        billingBasis: 'DAILY',
        billableRate: '',
        billingCurrency: 'SAR',
        roleTitle: employee?.positionTitle || '',
        costCenterId: '',
        notes: '',
      },
    ]);
  };

  const fillRemainingOnLast = () => {
    if (lines.length === 0) return;
    const sumOtherDays = lines.slice(0, -1).reduce((s, l) => s + Number(l.allocatedDays || 0), 0);
    const remDays = Math.max(0, Number((wDaysNum - sumOtherDays).toFixed(2)));
    const remPct = Number(((remDays / wDaysNum) * 100).toFixed(2));
    setLines((prev) =>
      prev.map((l, idx) =>
        idx === prev.length - 1 ? { ...l, allocatedDays: String(remDays), allocationPct: String(remPct) } : l,
      ),
    );
  };

  const importPrevMonthIntoDraft = async () => {
    if (!prevPeriod || !employee) return;
    try {
      const prevRes = await api.get<any>('/assignments', { periodId: prevPeriod.id, employeeId: employee.employeeId, pageSize: 50 });
      const prevRows = asArray(prevRes);
      if (prevRows.length === 0) {
        toast.error(new Error(`لا توجد توزيعات للموظف في ${prevPeriod.name}`));
        return;
      }
      setLines(
        prevRows.map((a: any, idx: number) => ({
          key: `imp-${idx}-${Date.now()}`,
          projectId: a.projectId,
          allocationBasis: String(a.allocationBasis || '').toUpperCase() === 'PERCENTAGE' ? 'PERCENTAGE' : 'DAYS',
          allocatedDays: String(a.allocatedDays ?? Number(((Number(a.allocationPct || 0) / 100) * wDaysNum).toFixed(2))),
          allocationPct: String(a.allocationPct ?? 100),
          billingBasis: (a.billingBasis || a.pricingBasis || 'DAILY') as 'DAILY' | 'MONTHLY' | 'HOURLY',
          billableRate: a.billableRate != null ? String(a.billableRate) : '',
          billingCurrency: a.billingCurrency || 'SAR',
          roleTitle: a.roleTitle || '',
          costCenterId: a.costCenterId || '',
          notes: a.notes || '',
        })),
      );
      toast.success(`تم استيراد ${prevRows.length} تخصيص من ${prevPeriod.name} — يمكنك التعديل ثم الحفظ`);
    } catch (e) {
      toast.error(e);
    }
  };

  const handleSave = async () => {
    if (!employee || !period || busy) return;
    if (isClosed) {
      toast.error(new Error(`الفترة ${period.name} مقفلة تاريخياً ولا يمكن تعديلها`));
      return;
    }
    const invalid = lines.find((l) => !l.projectId || (Number(l.allocatedDays || 0) <= 0 && Number(l.allocationPct || 0) <= 0));
    if (invalid) {
      toast.error(new Error('يرجى اختيار المشروع وإدخال أيام أو نسبة أكبر من صفر لكل سطر'));
      return;
    }
    setBusy(true);
    try {
      await api.put('/assignments/monthly-plan', {
        periodId: period.id,
        employeeId: employee.employeeId,
        workingDaysInMonth: wDaysNum,
        reason: reason.trim() || `تحديث توزيع ${employee.employeeNameAr} لشهر ${period.name}`,
        allocations: lines.map((l) => ({
          projectId: l.projectId,
          costCenterId: l.costCenterId || null,
          allocationBasis: l.allocationBasis,
          allocatedDays: Number(l.allocatedDays || 0),
          allocationPct: Math.min(100, Math.max(0.1, Number(l.allocationPct || 0))),
          workingDaysInMonth: wDaysNum,
          billableRate: l.billableRate ? Number(l.billableRate) : null,
          billingBasis: l.billingBasis,
          billingCurrency: l.billingCurrency || 'SAR',
          roleTitle: l.roleTitle || null,
          isBillable: true,
          notes: l.notes || null,
        })),
      });
      toast.success(`تم حفظ توزيع ${employee.employeeNameAr} لشهر ${period.name} بنجاح دون المساس بالأشهر السابقة`);
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  if (!employee || !period) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      saving={busy}
      onSaveShortcut={isClosed ? undefined : handleSave}
      title={`التوزيع الشهري للموظف: ${employee.employeeCode} — ${employee.employeeNameAr}`}
      subtitle={`الفترة: ${period.name} (${date(period.startDate)} — ${date(period.endDate)}) • التكلفة الشهرية القابلة للتوزيع: ${money(empCost)} SAR`}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            إغلاق
          </button>
          {!isClosed && (
            <button type="button" className="btn-primary flex items-center gap-1.5" onClick={handleSave} disabled={busy}>
              {busy ? <Spinner /> : <Sparkles className="size-3.5" />} حفظ توزيع {period.name}
            </button>
          )}
        </>
      }
    >
      <div className="space-y-4 text-xs">
        {isClosed && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200 flex items-center gap-2">
            <Lock className="size-4 shrink-0" />
            <span>هذه الفترة مقفلة تاريخياً. العرض للرجوع والمراجعة فقط ولا يمكن تعديل التوزيع التاريخي.</span>
          </div>
        )}

        {/* Live Capacity & Financial Strip */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-2.5 bg-slate-50/80 dark:bg-slate-900/60">
            <div className="text-[10px] text-slate-500">أيام العمل بالشهر</div>
            <input
              type="number"
              min="1"
              max="31"
              disabled={isClosed}
              className="input h-7 mt-1 font-mono font-bold text-sm"
              value={workingDays}
              onChange={(e) => {
                const nextWd = Math.max(1, Number(e.target.value || 22));
                setWorkingDays(e.target.value);
                setLines((prev) =>
                  prev.map((l) => {
                    if (l.allocationBasis === 'DAYS') {
                      return { ...l, allocationPct: String(Number(((Number(l.allocatedDays || 0) / nextWd) * 100).toFixed(2))) };
                    }
                    return { ...l, allocatedDays: String(Number(((Number(l.allocationPct || 0) / 100) * nextWd).toFixed(2))) };
                  }),
                );
              }}
            />
          </div>
          <div className={`rounded-xl border p-2.5 ${totalPct > 100.05 ? 'border-rose-300 bg-rose-50/70' : totalPct >= 99.5 ? 'border-emerald-300 bg-emerald-50/70' : 'border-blue-200 bg-blue-50/60'}`}>
            <div className="text-[10px] text-slate-600">إجمالي الموزع هذا الشهر</div>
            <div className="text-base font-black font-mono mt-0.5">{totalDays.toFixed(1)} / {wDaysNum} يوم</div>
            <div className="text-[11px] font-mono font-bold text-slate-700">{totalPct.toFixed(1)}%</div>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-2.5">
            <div className="text-[10px] text-slate-600">المتبقي Bench</div>
            <div className="text-base font-black font-mono mt-0.5 text-amber-700">{benchDays.toFixed(1)} يوم</div>
            <div className="text-[11px] font-mono text-amber-700">{benchPct.toFixed(1)}%</div>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-2.5">
            <div className="text-[10px] text-slate-600">إيراد الفوترة المتوقع</div>
            <div className="text-base font-black font-mono mt-0.5 text-emerald-700">{money(estRevenue)}</div>
            <div className="text-[10px] text-slate-500">SAR للشهر</div>
          </div>
          <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-2.5">
            <div className="text-[10px] text-slate-600">صافي العائد المتوقع</div>
            <div className={`text-base font-black font-mono mt-0.5 ${estProfit >= 0 ? 'text-indigo-700' : 'text-rose-600'}`}>
              {money(estProfit)}
            </div>
            <div className="text-[10px] text-slate-500">بعد خصم تكلفة الكادر</div>
          </div>
        </div>

        {totalPct > 100.05 && (
          <div className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-rose-800 flex items-center gap-2">
            <AlertTriangle className="size-4 shrink-0" />
            <span>تنبيه: إجمالي توزيع الموظف ({totalPct.toFixed(1)}%) يتجاوز 100% — الحفظ مسموح وسيتم تطبيع توزيع التكلفة على المشاريع آلياً حتى لا يتضاعف المصروف.</span>
          </div>
        )}

        {/* Quick Toolbar */}
        {!isClosed && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn-primary h-7 px-2.5 text-xs flex items-center gap-1" onClick={addLine}>
                <Plus className="size-3.5" /> إضافة مشروع لهذا الشهر
              </button>
              {lines.length > 0 && totalDays < wDaysNum && (
                <button type="button" className="btn-secondary h-7 px-2.5 text-xs flex items-center gap-1" onClick={fillRemainingOnLast}>
                  <ArrowLeftRight className="size-3" /> تعبئة المتبقي ({(wDaysNum - totalDays).toFixed(1)} يوم) بآخر سطر
                </button>
              )}
              {prevPeriod && (
                <button type="button" className="btn-secondary h-7 px-2.5 text-xs flex items-center gap-1 text-indigo-700" onClick={importPrevMonthIntoDraft}>
                  <Copy className="size-3" /> استيراد من {prevPeriod.name}
                </button>
              )}
            </div>
            <span className="text-[11px] text-slate-500">يمكن حذف كل السطور لإبقاء الموظف Bench 100% لهذا الشهر دون المساس بالأشهر السابقة.</span>
          </div>
        )}

        {/* Multi-project rows */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
          <table className="table w-full text-xs">
            <thead>
              <tr>
                <th className="min-w-[230px]">المشروع التعاقدي *</th>
                <th className="w-28">أساس التوزيع</th>
                <th className="w-24">الأيام</th>
                <th className="w-24">النسبة %</th>
                <th className="w-28">التسعير</th>
                <th className="w-28">سعر البيع</th>
                <th className="w-28 num">الإيراد المتوقع</th>
                {!isClosed && <th className="w-12" />}
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={isClosed ? 7 : 8} className="text-center py-6 text-slate-500">
                    لا توجد مشاريع مسندة للموظف في {period.name} (سيُحتسب الموظف متاح Bench 100% لهذا الشهر).
                  </td>
                </tr>
              ) : (
                lines.map((line, idx) => (
                  <tr key={line.key}>
                    <td>
                      <SearchableSelect
                        disabled={isClosed}
                        clearable={false}
                        options={projectOptions}
                        value={line.projectId}
                        onChange={(pid) => {
                          const defRate = resolveDefaultRate(pid);
                          setLines((prev) =>
                            prev.map((l, i) =>
                              i === idx
                                ? {
                                    ...l,
                                    projectId: pid,
                                    billableRate: l.billableRate || defRate.rate,
                                    billingBasis: defRate.basis,
                                    billingCurrency: defRate.currency,
                                  }
                                : l,
                            ),
                          );
                        }}
                        placeholder="— اختر المشروع —"
                      />
                    </td>
                    <td>
                      <select
                        disabled={isClosed}
                        className="input h-8 text-xs"
                        value={line.allocationBasis}
                        onChange={(e) => {
                          const basis = e.target.value as 'DAYS' | 'PERCENTAGE';
                          setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, allocationBasis: basis } : l)));
                        }}
                      >
                        <option value="DAYS">أيام عمل</option>
                        <option value="PERCENTAGE">نسبة %</option>
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        max={String(wDaysNum)}
                        disabled={isClosed}
                        className="input h-8 font-mono text-xs"
                        value={line.allocatedDays}
                        onChange={(e) => {
                          const dVal = e.target.value;
                          const pctCalc = Number(((Number(dVal || 0) / wDaysNum) * 100).toFixed(2));
                          setLines((prev) =>
                            prev.map((l, i) =>
                              i === idx
                                ? { ...l, allocationBasis: 'DAYS', allocatedDays: dVal, allocationPct: String(pctCalc) }
                                : l,
                            ),
                          );
                        }}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="1"
                        min="0"
                        max="100"
                        disabled={isClosed}
                        className="input h-8 font-mono text-xs"
                        value={line.allocationPct}
                        onChange={(e) => {
                          const pVal = e.target.value;
                          const daysCalc = Number(((Number(pVal || 0) / 100) * wDaysNum).toFixed(2));
                          setLines((prev) =>
                            prev.map((l, i) =>
                              i === idx
                                ? { ...l, allocationBasis: 'PERCENTAGE', allocationPct: pVal, allocatedDays: String(daysCalc) }
                                : l,
                            ),
                          );
                        }}
                      />
                    </td>
                    <td>
                      <select
                        disabled={isClosed}
                        className="input h-8 text-xs"
                        value={line.billingBasis}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((l, i) => (i === idx ? { ...l, billingBasis: e.target.value as any } : l)),
                          )
                        }
                      >
                        <option value="DAILY">يومي</option>
                        <option value="MONTHLY">شهري</option>
                        <option value="HOURLY">ساعي</option>
                      </select>
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          step="1"
                          min="0"
                          disabled={isClosed}
                          className="input h-8 font-mono text-xs w-20"
                          value={line.billableRate}
                          onChange={(e) =>
                            setLines((prev) =>
                              prev.map((l, i) => (i === idx ? { ...l, billableRate: e.target.value } : l)),
                            )
                          }
                        />
                        <span className="text-[10px] font-mono text-slate-500">{line.billingCurrency}</span>
                      </div>
                    </td>
                    <td className="num font-mono font-bold text-emerald-700">
                      {money(estimateLineRevenue(line, wDaysNum))}
                    </td>
                    {!isClosed && (
                      <td className="text-center">
                        <button
                          type="button"
                          title="حذف السطر"
                          className="btn-ghost h-7 w-7 p-0 text-rose-600"
                          onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!isClosed && (
          <Field label="سبب أو ملاحظة التغيير لهذا الشهر (يُسجّل في سجل التدقيق)">
            <input
              type="text"
              className="input h-9 text-xs"
              placeholder={`مثال: تعديل توزيع شهر ${period.name} نظراً لانتقال الموظف لمشروع التحول الرقمي`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
        )}
      </div>
    </Modal>
  );
}

/**
 * Modal to roll forward / clone allocations from a source period into the selected open period.
 */
function CopyMonthAllocationsModal({
  open,
  onClose,
  targetPeriod,
  defaultSourcePeriodId,
  periods,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  targetPeriod: PeriodOption | null;
  defaultSourcePeriodId: string;
  periods: PeriodOption[];
  onSuccess: () => void;
}) {
  const toast = useToast();
  const [fromPeriodId, setFromPeriodId] = useState('');
  const [mode, setMode] = useState<'SKIP_EXISTING' | 'REPLACE_EXISTING'>('SKIP_EXISTING');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setFromPeriodId(defaultSourcePeriodId || '');
      setMode('SKIP_EXISTING');
    }
  }, [open, defaultSourcePeriodId]);

  const handleCopy = async () => {
    if (!targetPeriod || !fromPeriodId || busy) return;
    if (fromPeriodId === targetPeriod.id) {
      toast.error(new Error('يرجى اختيار شهر مصدر مختلف عن الشهر الهدف'));
      return;
    }
    setBusy(true);
    try {
      const res = await api.post<any>('/assignments/copy-month', {
        fromPeriodId,
        toPeriodId: targetPeriod.id,
        mode,
      });
      toast.success(`تم ترحيل ${res?.copiedCount ?? 0} توزيع إلى ${targetPeriod.name} (تم تخطي ${res?.skippedEmployees ?? 0} موظف)`);
      onSuccess();
      onClose();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  if (!targetPeriod) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      saving={busy}
      title="نسخ وترحيل توزيع الموظفين من شهر آخر"
      subtitle={`سيتم نسخ التوزيعات النشطة إلى شهر: ${targetPeriod.name}`}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            إلغاء
          </button>
          <button type="button" className="btn-primary flex items-center gap-1.5" onClick={handleCopy} disabled={busy || !fromPeriodId}>
            {busy ? <Spinner /> : <Copy className="size-3.5" />} تنفيذ الترحيل الآن
          </button>
        </>
      }
    >
      <div className="space-y-4 text-xs">
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-3 text-indigo-900 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200 leading-relaxed">
          بدلاً من إعادة إدخال التخصيصات شهرياً من الصفر، ترحّل هذه الأداة توزيعات الشهر السابق إلى <strong>{targetPeriod.name}</strong> مع مراعاة تواريخ الالتحاق وإنهاء الخدمة وحالة المشاريع، وبعدها يمكنك تعديل الموظفين الذين تغيرت نسبهم فقط.
        </div>
        <Field label="نسخ التوزيع من شهر (المصدر)" required>
          <select className="input h-9 text-xs" value={fromPeriodId} onChange={(e) => setFromPeriodId(e.target.value)}>
            <option value="">— اختر الشهر المصدر —</option>
            {periods
              .filter((p) => p.id !== targetPeriod.id)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.startDate} ← {p.endDate})
                </option>
              ))}
          </select>
        </Field>
        <Field label="سلوك الترحيل للموظفين ذوي التوزيع القائم">
          <select className="input h-9 text-xs" value={mode} onChange={(e) => setMode(e.target.value as any)}>
            <option value="SKIP_EXISTING">آمن — تجاوز الموظفين الموزعين مسبقاً في {targetPeriod.name} (موصى به)</option>
            <option value="REPLACE_EXISTING">استبدال كامل — استبدال توزيع {targetPeriod.name} بالكامل</option>
          </select>
        </Field>
      </div>
    </Modal>
  );
}

// ============================================================================
// Main Page: Monthly Staff Distribution & Allocation Center (/prj/assignments)
// ============================================================================
export function AssignmentsPlannerPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [urlParams, setUrlParams] = useSearchParams();
  const periodsQuery = usePeriods();

  const periods = useMemo(
    () =>
      [...(periodsQuery.data ?? [])]
        .filter((p) => !p.isAdjustmentPeriod)
        .sort((a, b) => String(a.startDate).localeCompare(String(b.startDate))),
    [periodsQuery.data],
  );

  const [periodId, setPeriodId] = useState<string>(() => urlParams.get('periodId') || '');
  const [tab, setTab] = useState<PlannerTab>('plan');
  const [tierFilter, setTierFilter] = useState<FilterTier>('ALL');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [showAllPeriodsInRows, setShowAllPeriodsInRows] = useState(false);

  const [editingEmployee, setEditingEmployee] = useState<any | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);
  const [addingSingle, setAddingSingle] = useState(false);
  const [editingRow, setEditingRow] = useState<any | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  // Sync URL periodId if user switches month
  const handleSelectPeriod = (id: string) => {
    setPeriodId(id);
    const next = new URLSearchParams(urlParams);
    if (id) next.set('periodId', id);
    else next.delete('periodId');
    setUrlParams(next, { replace: true });
  };

  const periodIndex = periods.findIndex((p) => p.id === periodId);
  const selectedPeriod = periodIndex >= 0 ? periods[periodIndex] : null;
  const prevPeriod = periodIndex > 0 ? periods[periodIndex - 1] : null;
  const nextPeriod = periodIndex >= 0 && periodIndex + 1 < periods.length ? periods[periodIndex + 1] : null;
  const isClosedPeriod = selectedPeriod?.status === 'CLOSED';

  const planQuery = useQuery({
    queryKey: ['/assignments/monthly-plan', periodId, search],
    enabled: !!periodId,
    queryFn: () => api.get<any>('/assignments/monthly-plan', { periodId, ...(search ? { q: search } : {}) }),
  });

  const rowsQuery = useQuery({
    queryKey: ['/assignments', showAllPeriodsInRows ? 'ALL' : periodId, search],
    enabled: tab === 'rows',
    queryFn: () =>
      api.get<any>('/assignments', {
        page: 1,
        pageSize: 200,
        ...(search ? { q: search } : {}),
        ...(!showAllPeriodsInRows && periodId ? { periodId } : {}),
      }),
  });

  const matrixQuery = useQuery({
    queryKey: ['/assignments/monthly-matrix'],
    enabled: tab === 'matrix',
    queryFn: () => api.get<any>('/assignments/monthly-matrix'),
  });

  const projectsQuery = useQuery({
    queryKey: ['/projects', 'planner-modal'],
    queryFn: () => api.get<any>('/projects', { pageSize: 200 }),
  });
  const pricesQuery = useQuery({
    queryKey: ['/service-prices', 'planner-modal'],
    queryFn: () => api.get<any>('/service-prices', { pageSize: 200 }),
  });

  const allProjects = asArray(projectsQuery.data);
  const servicePrices = asArray(pricesQuery.data);

  const planEmployees: any[] = planQuery.data?.employees ?? [];
  const planSummary = planQuery.data?.summary ?? {
    totalEmployees: planEmployees.length,
    allocatedEmployees: 0,
    benchEmployeesCount: 0,
    overAllocatedCount: 0,
    totalAllocatedDays: 0,
    totalWorkingDays: 0,
    totalBenchDays: 0,
    avgUtilizationPct: 0,
    totalRevenueBase: 0,
    totalCostBase: 0,
    netProfitBase: 0,
  };

  const filteredPlanEmployees = useMemo(
    () => planEmployees.filter((emp) => tierFilter === 'ALL' || emp.statusTier === tierFilter),
    [planEmployees, tierFilter],
  );

  const detailRows: any[] = asArray(rowsQuery.data);

  const singleCopyMut = useMutation({
    mutationFn: (empId: string) =>
      api.post('/assignments/copy-month', {
        fromPeriodId: prevPeriod?.id,
        toPeriodId: periodId,
        employeeId: empId,
        mode: 'REPLACE_EXISTING',
      }),
    onSuccess: (res: any) => {
      toast.success(`تم نسخ ${res?.copiedCount ?? 0} تخصيص للموظف من ${prevPeriod?.name || 'الشهر السابق'}`);
      invalidateAllocationDependents(qc);
    },
    onError: (e) => toast.error(e),
  });

  const singleFields: FieldDef[] = useMemo(
    () => [
      { name: 'employeeId', label: 'الموظف *', type: 'ref', ref: REF.employee, required: true },
      { name: 'clientId', label: 'العميل المتعاقد', type: 'ref', ref: REF.client, hint: 'اختياري: لتصفية وتحديد العميل المتعاقد' },
      { name: 'projectId', label: 'المشروع التعاقدي *', type: 'ref', ref: REF.project, required: true },
      { name: 'costCenterId', label: 'مركز التكلفة', type: 'ref', ref: REF.costCenter },
      {
        name: 'allocationBasis',
        label: 'أساس التخصيص *',
        type: 'select',
        options: [
          { value: 'DAYS', label: 'أيام عمل محددة (مثلاً 18 يوم بمشروع و4 بأخر)' },
          { value: 'PERCENTAGE', label: 'نسبة مئوية % (مثلاً 100% أو 60%)' },
        ],
        default: 'DAYS',
        required: true,
      },
      { name: 'allocatedDays', label: 'عدد أيام العمل المخصصة', type: 'decimal', default: '22' },
      { name: 'workingDaysInMonth', label: 'أيام العمل الشهرية', type: 'number', default: 22 },
      { name: 'allocationPct', label: 'نسبة التخصيص %', type: 'decimal', default: '100' },
      {
        name: 'billingBasis',
        label: 'أساس الفوترة',
        type: 'select',
        options: [
          { value: 'DAILY', label: 'يومي (Daily Rate)' },
          { value: 'HOURLY', label: 'ساعي (Hourly Rate)' },
          { value: 'MONTHLY', label: 'شهري (Monthly Retainer)' },
        ],
        default: 'DAILY',
      },
      { name: 'billableRate', label: 'سعر البيع للعميل', type: 'decimal' },
      { name: 'billingCurrency', label: 'عملة الفوترة', type: 'ref', ref: REF.currency, default: 'SAR' },
      { name: 'roleTitle', label: 'الدور التعاقدي', type: 'text' },
      { name: 'startDate', label: 'من تاريخ *', type: 'date', required: true, default: selectedPeriod?.startDate },
      { name: 'endDate', label: 'إلى تاريخ', type: 'date', default: selectedPeriod?.endDate },
      { name: 'notes', label: 'ملاحظات', type: 'textarea' },
    ],
    [selectedPeriod?.startDate, selectedPeriod?.endDate],
  );

  const refreshAll = () => invalidateAllocationDependents(qc);

  return (
    <div className="space-y-4">
      <PageHeader
        title="التوزيع الشهري للموظفين على المشاريع"
        subtitle="تخطيط وتعديل توزيع كل موظف شهرياً بنظام الأيام أو النسب المئوية مع مقارنة الأشهر، ترحيل الشهر السابق، وحفظ السجل التاريخي لكل شهر."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {!isClosedPeriod && prevPeriod && (
              <button
                className="btn-secondary text-xs flex items-center gap-1.5 border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                onClick={() => setCopyOpen(true)}
              >
                <Copy className="size-3.5" /> نسخ من {prevPeriod.name}
              </button>
            )}
            <Link
              to={`/prj/allocation-days${periodId ? `?periodId=${periodId}` : ''}`}
              className="btn-secondary text-xs flex items-center gap-1.5 text-brand-700 bg-brand-50 border-brand-200 hover:bg-brand-100"
            >
              <Layers className="size-3.5 text-brand-600" /> تقرير الأيام والمبيعات
            </Link>
            <ExportMenu
              title={`توزيع الموظفين الشهري — ${selectedPeriod?.name || ''}`}
              columns={
                tab === 'rows'
                  ? [
                      { key: 'employeeNameAr', header: 'الموظف', width: 22 },
                      { key: 'projectNameAr', header: 'المشروع', width: 22 },
                      { key: 'allocatedDays', header: 'الأيام', width: 12, type: 'number' },
                      { key: 'allocationPct', header: 'النسبة %', width: 12, type: 'percent' },
                      { key: 'billableRate', header: 'سعر البيع', width: 14, type: 'currency' },
                      { key: 'startDate', header: 'من', width: 12 },
                      { key: 'endDate', header: 'إلى', width: 12 },
                    ]
                  : [
                      { key: 'employeeCode', header: 'الرمز', width: 12 },
                      { key: 'employeeNameAr', header: 'الموظف', width: 24 },
                      { key: 'totalAllocatedDays', header: 'الأيام المخصصة', width: 14, type: 'number' },
                      { key: 'totalAllocatedPct', header: 'الاستغلال %', width: 14, type: 'percent' },
                      { key: 'benchDays', header: 'أيام Bench', width: 12, type: 'number' },
                      { key: 'monthlyCostBase', header: 'تكلفة الشهر', width: 16, type: 'currency', isTotal: true },
                      { key: 'totalRevenueBase', header: 'الإيراد المتوقع', width: 16, type: 'currency', isTotal: true },
                    ]
              }
              data={tab === 'rows' ? detailRows : filteredPlanEmployees}
            />
            {!isClosedPeriod && (
              <button className="btn-primary text-xs flex items-center gap-1.5" onClick={() => setAddingSingle(true)}>
                <Plus className="size-4" /> تخصيص مفرد
              </button>
            )}
          </div>
        }
      />

      {/* Month Navigator Strip */}
      <div className="card p-3 flex flex-wrap items-center justify-between gap-3 bg-gradient-to-l from-slate-50 to-white dark:from-slate-900 dark:to-slate-900/60">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-200">
            <Calendar className="size-4 text-brand-600" />
            <span>الشهر / الفترة:</span>
          </div>
          <button
            type="button"
            disabled={!prevPeriod}
            title="الشهر السابق"
            className="btn-secondary h-9 px-2.5 text-xs disabled:opacity-40"
            onClick={() => prevPeriod && handleSelectPeriod(prevPeriod.id)}
          >
            <ChevronRight className="size-4" />
          </button>
          <PeriodSelect value={periodId} onChange={handleSelectPeriod} className="w-60" />
          <button
            type="button"
            disabled={!nextPeriod}
            title="الشهر التالي"
            className="btn-secondary h-9 px-2.5 text-xs disabled:opacity-40"
            onClick={() => nextPeriod && handleSelectPeriod(nextPeriod.id)}
          >
            <ChevronLeft className="size-4" />
          </button>
          {selectedPeriod && (
            <div className="flex items-center gap-2 ms-1">
              <Badge color={isClosedPeriod ? 'slate' : 'green'}>
                {isClosedPeriod ? 'مقفلة 🔒 (للقراءة فقط)' : 'مفتوحة للتعديل'}
              </Badge>
              <span className="text-[11px] font-mono text-slate-500 hidden sm:inline">
                {date(selectedPeriod.startDate)} — {date(selectedPeriod.endDate)}
              </span>
            </div>
          )}
        </div>

        {/* View Tabs */}
        <div className="flex items-center gap-1 rounded-xl bg-slate-100 dark:bg-slate-800 p-1">
          {[
            { id: 'plan', label: 'توزيع الشهر حسب الموظف' },
            { id: 'matrix', label: 'مقارنة الأشهر (Matrix)' },
            { id: 'rows', label: 'الجدول التفصيلي' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id as PlannerTab)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                tab === t.id
                  ? 'bg-white text-brand-700 shadow-sm dark:bg-slate-900 dark:text-brand-300'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3.5 md:grid-cols-4">
        <Stat
          label={`الكوادر في ${selectedPeriod?.name || 'الشهر'}`}
          value={`${planSummary.allocatedEmployees} / ${planSummary.totalEmployees}`}
          tone="blue"
          hint={`${planSummary.benchEmployeesCount} موظف لديه وقت Bench متاح`}
        />
        <Stat
          label="نسبة الاستغلال الكلية"
          value={`${planSummary.avgUtilizationPct}%`}
          tone={planSummary.avgUtilizationPct >= 85 ? 'green' : 'amber'}
          hint={`${planSummary.totalAllocatedDays} يوم موزع من ${planSummary.totalWorkingDays} يوم`}
        />
        <Stat
          label="أيام متاحة (Bench)"
          value={`${planSummary.totalBenchDays} يوم`}
          tone={planSummary.overAllocatedCount > 0 ? 'red' : 'amber'}
          hint={planSummary.overAllocatedCount > 0 ? `تنبيه: ${planSummary.overAllocatedCount} موظف بفائض >100%` : 'متاح لإسناده لمشاريع أخرى'}
        />
        <Stat
          label="صافي العائد التقديري للشهر"
          value={money(planSummary.netProfitBase)}
          tone={Number(planSummary.netProfitBase) >= 0 ? 'green' : 'red'}
          hint={`إيراد ${money(planSummary.totalRevenueBase)} − تكلفة ${money(planSummary.totalCostBase)}`}
        />
      </div>

      {/* Search & Filter Bar */}
      {tab !== 'matrix' && (
        <div className="card p-3 flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-72">
            <Search className="absolute start-2.5 top-2.5 size-4 text-slate-400" />
            <input
              className="input ps-8 h-9 text-xs"
              placeholder="بحث بالموظف أو الرمز أو المشروع…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          {tab === 'plan' && (
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  ['ALL', `الكل (${planEmployees.length})`],
                  ['FULL', 'مكتمل 100%'],
                  ['PARTIAL', 'توزيع جزئي'],
                  ['BENCH', 'Bench 0%'],
                  ['OVER', 'فائض (>100%)'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTierFilter(key)}
                  className={`rounded-full px-3 py-1 text-xs font-medium border transition ${
                    tierFilter === key
                      ? 'bg-brand-600 text-white border-brand-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {tab === 'rows' && (
            <label className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={showAllPeriodsInRows}
                onChange={(e) => setShowAllPeriodsInRows(e.target.checked)}
                className="rounded border-slate-300"
              />
              <span>عرض تخصيصات كل الأشهر معاً</span>
            </label>
          )}
        </div>
      )}

      {/* TAB 1: Employee-by-Employee Monthly Distribution Planner */}
      {tab === 'plan' && (
        <div className="space-y-3">
          {planQuery.isLoading ? (
            <Loading />
          ) : planQuery.error ? (
            <ErrorState error={planQuery.error} />
          ) : filteredPlanEmployees.length === 0 ? (
            <div className="card">
              <EmptyState text="لا يوجد موظفون نشطون مطابقون للبحث في هذا الشهر." />
            </div>
          ) : (
            filteredPlanEmployees.map((emp) => {
              const tier = TIER_META[emp.statusTier] || TIER_META.BENCH;
              const items: any[] = emp.items || [];
              return (
                <div key={emp.employeeId} className="card p-4 space-y-3">
                  {/* Card Header */}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="size-10 rounded-xl bg-brand-50 dark:bg-brand-950/50 text-brand-700 dark:text-brand-300 flex items-center justify-center font-bold">
                        <Users className="size-5" />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Link to={`/hr/employees/${emp.employeeId}`} className="font-bold text-sm text-brand-700 hover:underline">
                            {emp.employeeCode} — {emp.employeeNameAr}
                          </Link>
                          <Badge color={tier.color}>{tier.label}</Badge>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap gap-3">
                          <span>{emp.positionTitle}{emp.departmentName ? ` • ${emp.departmentName}` : ''}</span>
                          <span className="font-mono">تكلفة الشهر: <strong>{money(emp.monthlyCostBase)} SAR</strong></span>
                          {emp.totalRevenueBase > 0 && (
                            <span className="font-mono text-emerald-700">إيراد الشهر: <strong>{money(emp.totalRevenueBase)} SAR</strong></span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {!isClosedPeriod && items.length === 0 && prevPeriod && (
                        <button
                          type="button"
                          disabled={singleCopyMut.isPending}
                          onClick={() => singleCopyMut.mutate(emp.employeeId)}
                          className="btn-secondary h-8 px-2.5 text-xs flex items-center gap-1 text-indigo-700 border-indigo-200 bg-indigo-50/70"
                        >
                          <Copy className="size-3.5" /> استيراد من {prevPeriod.name}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setEditingEmployee(emp)}
                        className={isClosedPeriod ? 'btn-secondary h-8 px-3 text-xs flex items-center gap-1.5' : 'btn-primary h-8 px-3 text-xs flex items-center gap-1.5'}
                      >
                        {isClosedPeriod ? <Lock className="size-3.5" /> : <Pencil className="size-3.5" />}
                        {isClosedPeriod ? 'عرض توزيع الشهر' : items.length > 0 ? 'تعديل توزيع الشهر' : 'توزيع على المشاريع'}
                      </button>
                    </div>
                  </div>

                  {/* Visual Allocation Bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] font-mono">
                      <span>
                        المخصص: <strong className="text-slate-900 dark:text-slate-100">{emp.totalAllocatedDays}</strong> من <strong>{emp.workingDaysInMonth}</strong> يوم ({emp.totalAllocatedPct}%)
                      </span>
                      <span className={emp.isOverAllocated ? 'text-rose-600 font-bold' : emp.benchDays > 0 ? 'text-amber-700 font-medium' : 'text-emerald-700 font-medium'}>
                        {emp.isOverAllocated
                          ? `فائض +${emp.overAllocatedPct}% (مطبّع محاسبياً عند 100%)`
                          : emp.benchDays > 0
                            ? `متاح Bench: ${emp.benchDays} يوم (${emp.benchPct}%) — تكلفة مهدرة: ${money(emp.benchCostBase)} SAR`
                            : 'مكتمل الاستغلال 100%'}
                      </span>
                    </div>
                    <div className="h-2.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex">
                      {items.map((it, idx) => {
                        const widthPct = emp.totalAllocatedPct > 100 ? (it.allocationPct / emp.totalAllocatedPct) * 100 : it.allocationPct;
                        return (
                          <div
                            key={it.id || idx}
                            title={`${it.projectNameAr}: ${it.allocatedDays} يوم (${it.allocationPct}%)`}
                            className={`${SEGMENT_COLORS[idx % SEGMENT_COLORS.length]} h-full transition-all border-e border-white/40`}
                            style={{ width: `${Math.min(100, Math.max(2, widthPct))}%` }}
                          />
                        );
                      })}
                    </div>
                  </div>

                  {/* Assigned Projects Table for this Month */}
                  {items.length > 0 && (
                    <div className="rounded-lg border border-slate-200/80 dark:border-slate-800 overflow-x-auto">
                      <table className="table w-full text-xs">
                        <thead>
                          <tr>
                            <th>المشروع والعميل</th>
                            <th>مركز التكلفة</th>
                            <th>الأيام المخصصة</th>
                            <th>النسبة %</th>
                            <th>سعر البيع للعميل</th>
                            <th className="num">إيراد متوقع</th>
                            <th className="num">حصة التكلفة</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((it: any, idx: number) => (
                            <tr key={it.id || idx}>
                              <td>
                                <div className="flex items-center gap-1.5">
                                  <span className={`inline-block size-2 rounded-full ${SEGMENT_COLORS[idx % SEGMENT_COLORS.length]}`} />
                                  <Link to={`/prj/projects/${it.projectId}`} className="font-semibold hover:underline">
                                    {it.projectCode} — {it.projectNameAr}
                                  </Link>
                                </div>
                                {it.clientNameAr && <div className="text-[10px] text-slate-500 ps-3.5">{it.clientNameAr}</div>}
                              </td>
                              <td className="text-slate-600">{it.costCenterName || 'مركزي عام'}</td>
                              <td className="font-mono font-bold text-blue-700">{it.allocatedDays} يوم</td>
                              <td className="font-mono">{it.allocationPct}%</td>
                              <td className="font-mono text-emerald-700">
                                {Number(it.billableRate || 0).toLocaleString()} {it.billingCurrency || 'SAR'}/{it.billingBasis === 'MONTHLY' ? 'شهر' : it.billingBasis === 'HOURLY' ? 'ساعة' : 'يوم'}
                              </td>
                              <td className="num font-mono font-bold text-emerald-700">{money(it.monthlyRevenueBase)}</td>
                              <td className="num font-mono text-slate-700 dark:text-slate-300">{money(it.allocatedCostShareBase)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* TAB 2: Multi-Month Comparison Matrix */}
      {tab === 'matrix' && (
        <div className="card overflow-hidden">
          <div className="border-b border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center justify-between text-xs bg-slate-50/60 dark:bg-slate-900/50">
            <span className="font-bold">مصفوفة تطور توزيع الموظفين عبر أشهر السنة المالية — اضغط على أي خلية لتعديل توزيع الموظف في ذلك الشهر</span>
            <span className="text-slate-500">الأعمدة المقفلة 🔒 محمية</span>
          </div>
          {matrixQuery.isLoading ? (
            <Loading />
          ) : matrixQuery.error ? (
            <div className="p-4"><ErrorState error={matrixQuery.error} /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="table w-full text-xs">
                <thead>
                  <tr>
                    <th className="sticky start-0 bg-slate-50 dark:bg-slate-900 min-w-[200px] z-10">الموظف</th>
                    {(matrixQuery.data?.periods ?? []).map((p: any) => (
                      <th
                        key={p.id}
                        className={`min-w-[140px] text-center ${p.id === periodId ? 'bg-brand-50/90 text-brand-800 dark:bg-brand-950/40' : ''}`}
                      >
                        <div className="flex items-center justify-center gap-1">
                          <span>{p.name}</span>
                          {p.status === 'CLOSED' && <Lock className="size-3 text-slate-400" />}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(matrixQuery.data?.rows ?? []).map((r: any) => (
                    <tr key={r.employeeId}>
                      <td className="sticky start-0 bg-white dark:bg-slate-950 font-semibold z-10 border-e border-slate-100 dark:border-slate-800">
                        <Link to={`/hr/employees/${r.employeeId}`} className="text-brand-700 hover:underline">
                          {r.employeeCode} — {r.employeeNameAr}
                        </Link>
                      </td>
                      {(matrixQuery.data?.periods ?? []).map((p: any) => {
                        const cell = r.cells?.[p.id] || { totalPct: 0, totalDays: 0, projectCount: 0, projects: [] };
                        const color = cell.isOverAllocated
                          ? 'red'
                          : cell.totalPct >= 99.5
                            ? 'green'
                            : cell.totalPct > 0
                              ? 'amber'
                              : 'slate';
                        return (
                          <td
                            key={p.id}
                            className={`text-center p-2 cursor-pointer transition hover:bg-brand-50/40 ${p.id === periodId ? 'bg-brand-50/30' : ''}`}
                            onClick={async () => {
                              handleSelectPeriod(p.id);
                              try {
                                const res = await api.get<any>('/assignments/monthly-plan', { periodId: p.id });
                                const matched = (res?.employees || []).find((e: any) => e.employeeId === r.employeeId);
                                if (matched) setEditingEmployee(matched);
                              } catch (e) {
                                toast.error(e);
                              }
                            }}
                          >
                            <Badge color={color}>{cell.totalPct}% ({cell.totalDays} ي)</Badge>
                            {cell.projects?.length > 0 && (
                              <div className="text-[10px] text-slate-500 mt-1 space-y-0.5">
                                {cell.projects.slice(0, 2).map((pr: any, idx: number) => (
                                  <div key={idx} className="truncate max-w-[130px] mx-auto" title={`${pr.projectNameAr} (${pr.allocationPct}%)`}>
                                    {pr.projectCode || pr.projectNameAr}: {pr.allocationPct}%
                                  </div>
                                ))}
                                {cell.projects.length > 2 && <div>+{cell.projects.length - 2} أخرى</div>}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Detailed Assignment Ledger Table */}
      {tab === 'rows' && (
        <div className="card overflow-hidden">
          {rowsQuery.isLoading ? (
            <Loading />
          ) : rowsQuery.error ? (
            <div className="p-4"><ErrorState error={rowsQuery.error} /></div>
          ) : detailRows.length === 0 ? (
            <EmptyState text="لا توجد تخصيصات مطابقة في هذه الفترة." />
          ) : (
            <div className="overflow-x-auto">
              <table className="table w-full text-xs">
                <thead>
                  <tr>
                    <th>الموظف</th>
                    <th>المشروع التعاقدي والعميل</th>
                    <th>مركز التكلفة</th>
                    <th>التخصيص والأيام</th>
                    <th>سعر الفوترة</th>
                    <th>من</th>
                    <th>إلى</th>
                    <th>الحالة</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {detailRows.map((a: any) => (
                    <tr key={a.id}>
                      <td>
                        <Link to={`/hr/employees/${a.employeeId}`} className="font-bold text-brand-600 hover:underline">
                          {a.employeeNameAr || a.employeeName}
                        </Link>
                        {a.roleTitle && <div className="text-[11px] text-slate-500">{a.roleTitle}</div>}
                      </td>
                      <td>
                        <Link to={`/prj/projects/${a.projectId}`} className="font-semibold text-slate-900 dark:text-slate-100 hover:underline">
                          {a.projectCode} — {a.projectNameAr || a.projectName}
                        </Link>
                        {(a.clientNameAr || a.clientName) && (
                          <div className="text-[11px] text-slate-500">العميل: {a.clientNameAr || a.clientName}</div>
                        )}
                      </td>
                      <td className="text-slate-600">{a.costCenterName || 'مركزي عام'}</td>
                      <td>
                        <span className="font-mono font-bold text-blue-700">{a.allocationPct}%</span>
                        <span className="text-[11px] text-slate-500 ms-1 font-mono">({a.allocatedDays} يوم)</span>
                      </td>
                      <td>
                        {a.billableRate ? (
                          <span className="font-mono font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 inline-block">
                            {Number(a.billableRate).toLocaleString()} {a.billingCurrency || 'SAR'}/{a.billingBasis === 'DAILY' ? 'يوم' : a.billingBasis === 'HOURLY' ? 'ساعة' : 'شهر'}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="font-mono">{date(a.startDate)}</td>
                      <td className="font-mono">{a.endDate ? date(a.endDate) : 'مفتوح'}</td>
                      <td>{a.isOverAllocated ? <Badge color="red">فائض تخصيص</Badge> : <Badge color="green">طبيعي</Badge>}</td>
                      <td>
                        <div className="flex justify-end gap-1">
                          <button
                            title="تعديل"
                            className="btn-ghost h-7 w-7 p-0 text-brand-700"
                            onClick={() => setEditingRow(a)}
                          >
                            <Pencil className="size-3.5" />
                          </button>
                          {!a.endDate && (
                            <button
                              className="btn-ghost h-7 px-2 text-amber-700 text-xs"
                              onClick={async () => {
                                if (!confirm('إنهاء التخصيص عند نهاية الفترة؟')) return;
                                try {
                                  await api.post(`/assignments/${a.id}/end`, { endDate: selectedPeriod?.endDate || new Date().toISOString().slice(0, 10) });
                                  refreshAll();
                                  toast.success('تم إنهاء التخصيص');
                                } catch (e) {
                                  toast.error(e);
                                }
                              }}
                            >
                              إنهاء
                            </button>
                          )}
                          <button
                            title="حذف"
                            className="btn-ghost h-7 w-7 p-0 text-rose-600"
                            onClick={async () => {
                              if (!confirm('حذف سجل التخصيص؟')) return;
                              try {
                                await api.del(`/assignments/${a.id}`);
                                refreshAll();
                                toast.success('تم حذف التخصيص');
                              } catch (e) {
                                toast.error(e);
                              }
                            }}
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Multi-project Employee Monthly Editor */}
      <MonthlyEmployeeSplitModal
        open={!!editingEmployee}
        onClose={() => setEditingEmployee(null)}
        employee={editingEmployee}
        period={selectedPeriod}
        prevPeriod={prevPeriod}
        allProjects={allProjects}
        servicePrices={servicePrices}
        onSaved={refreshAll}
      />

      {/* Roll-forward / Copy Month Modal */}
      <CopyMonthAllocationsModal
        open={copyOpen}
        onClose={() => setCopyOpen(false)}
        targetPeriod={selectedPeriod}
        defaultSourcePeriodId={prevPeriod?.id || ''}
        periods={periods}
        onSuccess={refreshAll}
      />

      {/* Single Add Assignment Modal */}
      <FormModal
        open={addingSingle}
        wide
        title={`إضافة تخصيص جديد${selectedPeriod ? ` (${selectedPeriod.name})` : ''}`}
        fields={singleFields}
        initial={{ startDate: selectedPeriod?.startDate, endDate: selectedPeriod?.endDate }}
        onClose={() => setAddingSingle(false)}
        onSubmit={async (b) => {
          await api.post('/assignments', b);
          refreshAll();
        }}
      />

      {/* Single Edit Assignment Modal */}
      <FormModal
        open={!!editingRow}
        wide
        title="تعديل سجل التخصيص"
        fields={singleFields}
        initial={editingRow || undefined}
        onClose={() => setEditingRow(null)}
        onSubmit={async (b) => {
          if (!editingRow) return;
          await api.patch(`/assignments/${editingRow.id}`, b);
          refreshAll();
        }}
      />
    </div>
  );
}
