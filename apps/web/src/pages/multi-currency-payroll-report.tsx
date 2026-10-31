import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Banknote, Calendar, Download, Printer, Users
} from 'lucide-react';
import { api } from '../lib/api';
import { date, downloadCsv, money, today } from '../lib/format';
import { Badge, EmptyState, ErrorState, Loading, PageHeader, useToast } from '../components/ui';

export function MultiCurrencyPayrollReportPage() {
  const toast = useToast();
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('');
  const [currencyFilter, setCurrencyFilter] = useState<'ALL' | 'SAR' | 'EGP'>('ALL');

  // Query: Fiscal periods
  const { data: periods = [] } = useQuery({
    queryKey: ['fiscal-periods'],
    queryFn: () => api.get<any[]>('/fiscal-periods').then((r: any) => r || []),
  });

  // Default to first open or recent period
  const activePeriodId = selectedPeriodId || periods[0]?.id || '';

  // Query: Payroll Runs for this period
  const { data: runsData, isLoading, error } = useQuery({
    queryKey: ['payroll-runs-report', activePeriodId],
    queryFn: async () => {
      if (!activePeriodId) return null;
      // Fetch latest posted or draft run for this period
      const runs = await api.get<any>('/payroll-runs', { pageSize: '50' });
      const run = runs?.data?.find((r: any) => r.fiscalPeriodId === activePeriodId && r.status !== 'CANCELLED') || runs?.data?.[0];
      if (!run) {
        // Return preview lines if no run exists
        const prev = await api.get<any>(`/payroll-runs/preview?periodId=${activePeriodId}`);
        return { isPreview: true, ...prev };
      }
      // Fetch detailed run with lines
      const detailed = await api.get<any>(`/payroll-runs/${run.id}`);
      return { isPreview: false, ...detailed };
    },
    enabled: !!activePeriodId,
  });

  const lines = runsData?.lines || [];

  // Filter lines by payout currency if selected
  const filteredLines = useMemo(() => {
    if (currencyFilter === 'ALL') return lines;
    return lines.filter((l: any) => (l.payoutCurrency || 'EGP').toUpperCase() === currencyFilter);
  }, [lines, currencyFilter]);

  // Aggregate Totals
  const totals = useMemo(() => {
    let sarPayoutTotal = 0;
    let egpPayoutTotal = 0;
    let baseNetTotal = 0;
    let sarCount = 0;
    let egpCount = 0;

    for (const l of lines) {
      const pCur = (l.payoutCurrency || 'EGP').toUpperCase();
      const pAmt = parseFloat(l.payoutAmount || l.netPayableBase || '0');
      const baseNet = parseFloat(l.netPayableBase || '0');

      baseNetTotal += baseNet;
      if (pCur === 'SAR') {
        sarPayoutTotal += pAmt;
        sarCount++;
      } else {
        egpPayoutTotal += pAmt;
        egpCount++;
      }
    }

    return {
      sarPayoutTotal,
      egpPayoutTotal,
      baseNetTotal,
      sarCount,
      egpCount,
      totalCount: lines.length,
    };
  }, [lines]);

  // Bank files export preview
  const handleExportBankFile = (cur: 'SAR' | 'EGP') => {
    const list = lines.filter((l: any) => (l.payoutCurrency || 'EGP').toUpperCase() === cur);
    const bankName = cur === 'SAR' ? 'مصرف الراجحي / الرياض (حوالات الرواتب بالسعودية)' : 'البنك التجاري الدولي CIB / الأهلي (رواتب فرع مصر)';

    downloadCsv(`salary-batch-${cur}-${today()}.csv`, [
      [`ملف مسيّر الرواتب البنكي — عملة الدفع: ${cur}`],
      [`البنك المنفذ: ${bankName}`],
      ['التاريخ:', today()],
      [],
      ['كود الموظف', 'اسم الموظف', 'المبلغ المصروف', 'عملة الدفع', 'رقم الحساب / الآيبان IBAN', 'البيان'],
      ...list.map((l: any) => [
        l.employeeCode || l.employeeId,
        l.employeeName,
        l.payoutAmount || l.netPayableBase,
        cur,
        l.iban || l.bankAccountNo || 'SA0000000000000000000000',
        `راتب شهر ${runsData?.periodName || 'الحالي'}`,
      ]),
    ]);
    toast.success(`تم تصدير ملف صرف الرواتب البنكي (${cur}) بنجاح`);
  };

  const handleExportFullCsv = () => {
    downloadCsv(`multi-currency-payroll-report-${today()}.csv`, [
      ['تقرير مسير الرواتب المجمّع متعدد العملات (SAR / EGP)'],
      ['الفترة:', runsData?.periodName || '—'],
      ['التاريخ:', today()],
      [],
      ['كود الموظف', 'اسم الموظف', 'عملة العقد', 'الراتب الأساسي', 'البدلات والمكافآت', 'الاستقطاعات والسلف', 'صافي الراتب (بالأساس)', 'عملة الصرف', 'سعر الصرف المطبق', 'صافي الصرف بالعملة', 'حالة المسير'],
      ...lines.map((l: any) => [
        l.employeeCode || '—',
        l.employeeName,
        l.contractCurrency || 'EGP',
        l.salaryBase,
        Number(l.bonusesBase || 0) + Number(l.allowancesBase || 0) + Number(l.overtimeBase || 0),
        Number(l.deductionsBase || 0) + Number(l.loanDeductionsBase || 0),
        l.netPayableBase,
        l.payoutCurrency || 'EGP',
        l.payoutExchangeRate || '1',
        l.payoutAmount || l.netPayableBase,
        runsData?.status || 'مسودة',
      ]),
    ]);
    toast.success('تم تصدير مسير الرواتب المجمع بنجاح');
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="تقرير مسيّر الرواتب متعدد العملات (الريال والجنيه المصري)"
        subtitle="إدارة وتوزيع صرف رواتب الكوادر بالريال السعودي أو الجنيه المصري مع جداول التحويل البنكي وفروق الصرف"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-secondary text-xs flex items-center gap-1.5" onClick={() => window.print()}>
              <Printer className="size-3.5" /> طباعة المسير
            </button>
            <button className="btn-secondary text-xs flex items-center gap-1.5" onClick={handleExportFullCsv}>
              <Download className="size-3.5" /> تصدير شامل (Excel)
            </button>
            <button
              className="btn-primary text-xs flex items-center gap-1.5"
              onClick={() => handleExportBankFile('SAR')}
            >
              <Banknote className="size-3.5" /> ملف بنك الرياض/الراجحي (SAR)
            </button>
            <button
              className="btn bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5"
              onClick={() => handleExportBankFile('EGP')}
            >
              <Banknote className="size-3.5" /> ملف بنك مصر/CIB (EGP)
            </button>
          </div>
        }
      />

      {/* Period Selection & Filter Strip */}
      <div className="card p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Calendar className="size-4 text-amber-500" />
          <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200">فترة مسيّر الرواتب:</span>
          <select
            className="input text-xs py-1.5 w-64 font-bold"
            value={activePeriodId}
            onChange={(e) => setSelectedPeriodId(e.target.value)}
          >
            {periods.map((p: any) => (
              <option key={p.id} value={p.id}>
                {p.name} ({date(p.startDate)} إلى {date(p.endDate)})
              </option>
            ))}
          </select>

          {runsData?.status && (
            <Badge color={runsData.status === 'POSTED' ? 'green' : 'amber'}>
              {runsData.status === 'POSTED' ? 'مسير معتمد ومرحل' : 'مسودة قيد المراجعة'}
            </Badge>
          )}
        </div>

        {/* Currency Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 me-2">تصفية حسب عملة الصرف:</span>
          {[
            { id: 'ALL', label: `كافة الرواتب (${totals.totalCount})` },
            { id: 'SAR', label: `صرف بالريال (${totals.sarCount})` },
            { id: 'EGP', label: `صرف بالجنيه (${totals.egpCount})` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setCurrencyFilter(tab.id as any)}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                currencyFilter === tab.id
                  ? 'bg-amber-500 text-slate-950 shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-[#080d1a] dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="p-12 text-center"><Loading /></div>
      ) : error ? (
        <div className="p-8"><ErrorState error={error} /></div>
      ) : lines.length === 0 ? (
        <div className="p-12 text-center card">
          <EmptyState text="لا يوجد مسيّر رواتب أو بيانات موظفين لهذه الفترة." />
        </div>
      ) : (
        <div className="space-y-6">
          {/* 3 Executive Financial Disbursal Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Card 1: SAR Bank Wires */}
            <div className="card cyber-card-blue p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-slate-700 dark:text-slate-300">إجمالي الرواتب المصروفة بالريال (SAR)</span>
                <span className="px-2.5 py-1 bg-blue-500/12 text-blue-700 dark:text-blue-400 ring-1 ring-blue-500/25 rounded-lg font-extrabold text-xs">SAR</span>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-black text-slate-900 dark:text-white tracking-tight font-mono">
                  {money(totals.sarPayoutTotal)} <span className="text-xs font-bold text-slate-500">SAR</span>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 flex items-center justify-between">
                  <span>عدد الموظفين: <strong className="text-slate-800 dark:text-slate-200">{totals.sarCount}</strong> كادر</span>
                  <span>حساب مصرف الراجحي / الرياض</span>
                </div>
              </div>
            </div>

            {/* Card 2: EGP Bank Transfers */}
            <div className="card cyber-card-emerald p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-slate-700 dark:text-slate-300">إجمالي الرواتب المصروفة بالجنيه (EGP)</span>
                <span className="px-2.5 py-1 bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-500/25 rounded-lg font-extrabold text-xs">EGP</span>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-black text-emerald-700 dark:text-emerald-400 tracking-tight font-mono">
                  {money(totals.egpPayoutTotal)} <span className="text-xs font-bold text-slate-500">EGP</span>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 flex items-center justify-between">
                  <span>عدد الموظفين: <strong className="text-slate-800 dark:text-slate-200">{totals.egpCount}</strong> كادر</span>
                  <span>البنك التجاري الدولي CIB / الأهلي</span>
                </div>
              </div>
            </div>

            {/* Card 3: Total Equivalent Base */}
            <div className="card cyber-card-amber p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-slate-700 dark:text-slate-300">إجمالي عبء الرواتب بدفاتر الشركة (الأساس)</span>
                <span className="px-2.5 py-1 bg-amber-500/15 text-amber-700 dark:text-amber-400 ring-1 ring-amber-500/25 rounded-lg font-extrabold text-xs">GL BASE</span>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-black text-slate-900 dark:text-white tracking-tight font-mono">
                  {money(totals.baseNetTotal)} <span className="text-xs font-bold text-slate-500">EGP</span>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 flex items-center justify-between">
                  <span>إجمالي الكوادر: <strong className="text-slate-800 dark:text-slate-200">{totals.totalCount}</strong> موظف</span>
                  <span>القيد: حـ/ 5100 و حـ/ 2100</span>
                </div>
              </div>
            </div>
          </div>

          {/* Section: Detailed Payroll Table */}
          <div className="card overflow-hidden">
            <div className="border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-[#080d1a] px-5 py-3.5">
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <Users className="size-4 text-cyan-600 dark:text-cyan-400" />
                تفاصيل مسيّر الرواتب بالعملات المحلية والمحولة
              </h3>
            </div>

            <div className="overflow-x-auto custom-scrollbar">
              <table className="table w-full text-right text-xs">
                <thead>
                  <tr>
                    <th className="py-3 px-4">كود</th>
                    <th className="py-3 px-4">الموظف / المطور</th>
                    <th className="py-3 px-4 text-center">عملة العقد</th>
                    <th className="py-3 px-4 text-center">الراتب الأساسي</th>
                    <th className="py-3 px-4 text-center">البدلات والمكافآت</th>
                    <th className="py-3 px-4 text-center">الاستقطاعات والسلف</th>
                    <th className="py-3 px-4 text-center">الصافي (بالأساس)</th>
                    <th className="py-3 px-4 text-center">عملة الصرف المنفذة</th>
                    <th className="py-3 px-4 text-center">سعر الصرف المطبق</th>
                    <th className="py-3 px-4 text-center font-bold">صافي الصرف بالعملة</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLines.map((l: any) => {
                    const payoutCur = (l.payoutCurrency || 'EGP').toUpperCase();
                    const isSar = payoutCur === 'SAR';
                    const contractCur = (l.contractCurrency || 'EGP').toUpperCase();

                    return (
                      <tr key={l.employeeId}>
                        <td className="py-3 px-4 font-mono font-bold text-slate-600 dark:text-slate-300">
                          {l.employeeCode || '—'}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900 dark:text-white">{l.employeeName}</div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">{l.jobTitle || l.departmentName || 'تقنية المعلومات'}</div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="font-mono font-bold text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            {contractCur}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center font-mono font-semibold">
                          {money(l.salaryBase)}
                        </td>
                        <td className="py-3 px-4 text-center font-mono text-emerald-700 dark:text-emerald-400">
                          {Number(l.bonusesBase || 0) + Number(l.allowancesBase || 0) + Number(l.overtimeBase || 0) > 0 ? (
                            `+${money(Number(l.bonusesBase || 0) + Number(l.allowancesBase || 0) + Number(l.overtimeBase || 0))}`
                          ) : (
                            '0'
                          )}
                        </td>
                        <td className="py-3 px-4 text-center font-mono text-rose-600 dark:text-rose-400">
                          {Number(l.deductionsBase || 0) + Number(l.loanDeductionsBase || 0) > 0 ? (
                            `-${money(Number(l.deductionsBase || 0) + Number(l.loanDeductionsBase || 0))}`
                          ) : (
                            '0'
                          )}
                        </td>
                        <td className="py-3 px-4 text-center font-mono font-semibold">
                          {money(l.netPayableBase)} EGP
                        </td>
                        <td className="py-3 px-4 text-center">
                          <Badge color={isSar ? 'blue' : 'green'}>
                            {payoutCur} {isSar ? '(تحويل الرياض)' : '(تحويل القاهرة)'}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-center font-mono">
                          {l.payoutExchangeRate && Number(l.payoutExchangeRate) !== 1 ? (
                            <span className="font-bold text-cyan-700 dark:text-cyan-400">{l.payoutExchangeRate}</span>
                          ) : (
                            '1.0000'
                          )}
                        </td>
                        <td className="py-3 px-4 text-center font-mono font-black text-slate-900 dark:text-amber-400 text-sm">
                          {money(l.payoutAmount || l.netPayableBase)} {payoutCur}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={6} className="py-3 px-4 text-start font-extrabold">
                      إجمالي المسير المعتمد للفترة:
                    </td>
                    <td className="py-3 px-4 text-center font-mono font-black">
                      {money(totals.baseNetTotal)} EGP
                    </td>
                    <td colSpan={2} className="py-3 px-4 text-center">
                      SAR {money(totals.sarPayoutTotal)} + EGP {money(totals.egpPayoutTotal)}
                    </td>
                    <td className="py-3 px-4 text-center font-mono font-black text-cyan-700 dark:text-amber-400">
                      مجمع بالعملتين
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
