import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeftRight, Download, FileCheck,
  PieChart, Printer, RefreshCw, TrendingUp, Users, Wallet
} from 'lucide-react';
import { api } from '../lib/api';
import { downloadCsv, money, today } from '../lib/format';
import { Badge, ErrorState, Loading, PageHeader, useToast } from '../components/ui';

export function CustodyReportPage() {
  const toast = useToast();
  const [employeeFilter, setEmployeeFilter] = useState('');
  const [fromDate, setFromDate] = useState('2026-01-01');
  const [toDate, setToDate] = useState(today());

  // Query: Custody Report
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['custody-report-page', employeeFilter, fromDate, toDate],
    queryFn: () => {
      const p: Record<string, string> = {};
      if (employeeFilter) p.employeeId = employeeFilter;
      if (fromDate) p.fromDate = fromDate;
      if (toDate) p.toDate = toDate;
      return api.get<any>('/custodies/report', p);
    },
  });

  // Query: Employees for filter
  const { data: employees = [] } = useQuery({
    queryKey: ['employees-picker'],
    queryFn: () => api.get<any[]>('/employees', { pageSize: '100' }).then((r: any) => r.data || []),
  });

  const kpis = data?.kpis;
  const expenseBreakdown = data?.expenseBreakdown || [];
  const custodians = data?.custodians || [];

  const handleExportCsv = () => {
    downloadCsv(`branch-custody-movement-report-${today()}.csv`, [
      ['كشف حركة وتسوية العهد النقدية ومصروفات الفروع متعددة العملات'],
      ['التاريخ:', today()],
      [],
      ['ملخص المؤشرات المالية'],
      ['إجمالي عدد العهد', kpis?.totalCustodiesCount || 0],
      ['إجمالي المصروف بالريال', kpis?.totalDisbursedSar || 0],
      ['المحول للجنيه المصري', kpis?.totalConvertedToEgp || 0],
      ['إجمالي المصروفات المسوّاة بإيصالات', kpis?.totalSettledEgp || 0],
      ['الرصيد المتبقي طرف أمناء العهد', kpis?.totalRemainingBalanceEgp || 0],
      [],
      ['توزيع المصروفات حسب التصنيف المحاسبي'],
      ['رمز الحساب', 'اسم الحساب', 'عدد الإيصالات', 'المبلغ قبل الضريبة', 'الضريبة', 'الإجمالي بالجنيه'],
      ...expenseBreakdown.map((e: any) => [
        e.accountCode, e.accountNameAr, e.vouchersCount, e.subtotal, e.vatAmount, e.totalAmount,
      ]),
      [],
      ['أرصدة ومسؤوليات أمناء العهد'],
      ['كود الموظف', 'اسم أمين العهدة', 'عدد العهد', 'المصروف بالريال', 'المحول بالجنيه', 'المسوّى بإيصالات', 'الرصيد المتبقي'],
      ...custodians.map((c: any) => [
        c.employeeCode, c.employeeNameAr, c.custodiesCount, c.disbursedSar, c.convertedEgp, c.settledEgp, c.balanceEgp,
      ]),
    ]);
    toast.success('تم تصدير تقرير العهد بنجاح');
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="تقرير حركة وتسوية العهد ومصروفات الفروع متعددة العملات"
        subtitle="متابعة التدفقات النقدية المحولة من المركز الرئيسي (SAR) إلى فرع مصر (EGP) وتسويات الفواتير والأرصدة"
        actions={
          <div className="flex items-center gap-2">
            <button className="btn-secondary text-xs flex items-center gap-1.5" onClick={() => window.print()}>
              <Printer className="size-3.5" /> طباعة التقرير
            </button>
            <button className="btn-secondary text-xs flex items-center gap-1.5" onClick={handleExportCsv}>
              <Download className="size-3.5" /> تصدير Excel/CSV
            </button>
            <button className="btn-ghost text-xs p-2" onClick={() => refetch()} title="تحديث البيانات">
              <RefreshCw className="size-3.5" />
            </button>
          </div>
        }
      />

      {/* Filter Bar */}
      <div className="card p-4 bg-white border border-slate-200 shadow-sm rounded-xl flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-700">تصفية حسب أمين العهدة:</span>
          <select
            className="input text-xs py-1.5 w-60"
            value={employeeFilter}
            onChange={(e) => setEmployeeFilter(e.target.value)}
          >
            <option value="">— كافة أمناء العهد والفروع —</option>
            {employees.map((emp: any) => (
              <option key={emp.id} value={emp.id}>
                {emp.code} — {emp.full_name_ar || emp.fullNameAr}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-700">الفترة من:</span>
          <input
            type="date"
            className="input text-xs py-1.5 font-mono"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
          <span className="text-xs font-bold text-slate-700">إلى:</span>
          <input
            type="date"
            className="input text-xs py-1.5 font-mono"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="p-12 text-center"><Loading /></div>
      ) : error ? (
        <div className="p-8"><ErrorState error={error} /></div>
      ) : (
        <div className="space-y-6">
          {/* Executive KPI Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="card p-5 bg-white border border-slate-200 shadow-sm rounded-xl">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">إجمالي المصروف من الرياض</span>
                <span className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                  <Wallet className="size-5" />
                </span>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-black text-slate-900 tracking-tight font-mono">
                  {money(kpis?.totalDisbursedSar ?? 0)} SAR
                </div>
                <div className="text-xs text-slate-500 mt-1">حوالات نقدية بالريال السعودي</div>
              </div>
            </div>

            <div className="card p-5 bg-white border border-slate-200 shadow-sm rounded-xl">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">المحول للجنيه المصري (FX)</span>
                <span className="p-2 bg-cyan-50 text-cyan-600 rounded-lg">
                  <ArrowLeftRight className="size-5" />
                </span>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-black text-slate-900 tracking-tight font-mono">
                  {money(kpis?.totalConvertedToEgp ?? 0)} EGP
                </div>
                <div className="text-xs text-cyan-700 font-semibold mt-1">سيولة متوفرة في حسابات فرع مصر</div>
              </div>
            </div>

            <div className="card p-5 bg-white border border-slate-200 shadow-sm rounded-xl">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">إجمالي الفواتير المسوّاة</span>
                <span className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                  <FileCheck className="size-5" />
                </span>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-black text-slate-900 tracking-tight font-mono">
                  {money(kpis?.totalSettledEgp ?? 0)} EGP
                </div>
                <div className="text-xs text-emerald-700 font-semibold mt-1">مصروفات معتمدة ومرحلة محاسبياً</div>
              </div>
            </div>

            <div className="card p-5 bg-white border border-slate-200 shadow-sm rounded-xl">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">الرصيد المتبقي بالفرع</span>
                <span className="p-2 bg-amber-50 text-amber-600 rounded-lg">
                  <TrendingUp className="size-5" />
                </span>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-black text-amber-600 tracking-tight font-mono">
                  {money(kpis?.totalRemainingBalanceEgp ?? 0)} EGP
                </div>
                <div className="text-xs text-slate-500 mt-1">عهد قيد الاستهلاك بانتظار الفواتير</div>
              </div>
            </div>
          </div>

          {/* Section 1: Spending Breakdown by Expense Category */}
          <div className="card bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden p-6">
            <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
              <PieChart className="size-4 text-blue-600" />
              توزيع مصروفات الفروع التشغيلية حسب التصنيف المحاسبي
            </h3>

            {expenseBreakdown.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-lg">
                لا توجد فواتير أو إيصالات تسوية مسجلة خلال الفترة المحددة.
              </div>
            ) : (
              <div className="overflow-x-auto custom-scrollbar">
                <table className="table w-full text-right text-xs">
                  <thead className="bg-slate-50/80 border-b border-slate-200 font-bold text-slate-700">
                    <tr>
                      <th className="py-3 px-4">رمز الحساب</th>
                      <th className="py-3 px-4">اسم بند المصروف التشغيلي</th>
                      <th className="py-3 px-4 text-center">عدد الإيصالات</th>
                      <th className="py-3 px-4 text-center">المبلغ قبل الضريبة</th>
                      <th className="py-3 px-4 text-center">ضريبة القيمة المضافة (14%)</th>
                      <th className="py-3 px-4 text-center font-bold">إجمالي المصروف المعادل</th>
                      <th className="py-3 px-4 text-center">النسبة من الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {expenseBreakdown.map((exp: any) => {
                      const totalAll = Number(kpis?.totalSettledEgp || 1);
                      const share = Math.round((Number(exp.totalAmount) / totalAll) * 100);

                      return (
                        <tr key={exp.accountCode} className="hover:bg-slate-50/60">
                          <td className="py-3 px-4 font-mono font-bold text-blue-600">{exp.accountCode}</td>
                          <td className="py-3 px-4 font-semibold text-slate-900">{exp.accountNameAr}</td>
                          <td className="py-3 px-4 text-center font-mono">{exp.vouchersCount}</td>
                          <td className="py-3 px-4 text-center font-mono">{money(exp.subtotal)} EGP</td>
                          <td className="py-3 px-4 text-center font-mono text-rose-600">
                            {Number(exp.vatAmount) > 0 ? `${money(exp.vatAmount)} EGP` : '0'}
                          </td>
                          <td className="py-3 px-4 text-center font-mono font-bold text-slate-900">
                            {money(exp.totalAmount)} EGP
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <div className="w-16 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                <div className="bg-blue-600 h-1.5 rounded-full" style={{ width: `${share}%` }} />
                              </div>
                              <span className="font-mono text-[11px] font-bold text-slate-600">{share}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Section 2: Custodian Accountability & Balances Table */}
          <div className="card bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden p-6">
            <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Users className="size-4 text-indigo-600" />
              كشف حساب ومسؤولية أمناء العهد في الفروع
            </h3>

            {custodians.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-lg">
                لا توجد سجلات عهد لأمناء العهد.
              </div>
            ) : (
              <div className="overflow-x-auto custom-scrollbar">
                <table className="table w-full text-right text-xs">
                  <thead className="bg-slate-50/80 border-b border-slate-200 font-bold text-slate-700">
                    <tr>
                      <th className="py-3 px-4">كود الموظف</th>
                      <th className="py-3 px-4">اسم أمين العهدة (المسؤول)</th>
                      <th className="py-3 px-4 text-center">عدد العهد المستلمة</th>
                      <th className="py-3 px-4 text-center">المصروف بالريال (SAR)</th>
                      <th className="py-3 px-4 text-center">المحول بالجنيه (EGP)</th>
                      <th className="py-3 px-4 text-center">المسوّى بإيصالات معتمدة</th>
                      <th className="py-3 px-4 text-center">الرصيد المتبقي ذمة الموظف</th>
                      <th className="py-3 px-4 text-center">حالة الرصيد</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {custodians.map((c: any) => {
                      const balance = Number(c.balanceEgp);
                      return (
                        <tr key={c.employeeId} className="hover:bg-slate-50/60">
                          <td className="py-3 px-4 font-mono font-bold text-slate-700">{c.employeeCode}</td>
                          <td className="py-3 px-4 font-bold text-slate-900">{c.employeeNameAr}</td>
                          <td className="py-3 px-4 text-center font-mono">{c.custodiesCount}</td>
                          <td className="py-3 px-4 text-center font-mono font-bold text-slate-900">
                            {money(c.disbursedSar)} SAR
                          </td>
                          <td className="py-3 px-4 text-center font-mono font-bold text-cyan-800">
                            {money(c.convertedEgp)} EGP
                          </td>
                          <td className="py-3 px-4 text-center font-mono font-bold text-emerald-700">
                            {money(c.settledEgp)} EGP
                          </td>
                          <td className="py-3 px-4 text-center font-mono font-black text-amber-600">
                            {money(c.balanceEgp)} EGP
                          </td>
                          <td className="py-3 px-4 text-center">
                            {balance === 0 ? (
                              <Badge color="green">مسواة ومقفلة</Badge>
                            ) : (
                              <Badge color="amber">عهدة نشطة</Badge>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
