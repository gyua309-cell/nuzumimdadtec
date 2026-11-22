import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart3, Calendar, CheckCircle2, Landmark,
  PieChart, Printer, Receipt, ShieldCheck, Sparkles, TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { api } from '../lib/api';
import { money, today } from '../lib/format';
import { usePeriods } from '../components/forms';
import { ExecutiveBarChart, ExecutiveChartCard, ExecutiveDonutChart } from '../components/ExecutiveCharts';
import { ExportMenu } from '../components/ExportMenu';
import { ExportEngine } from '../engine/export-engine';
import { Badge, PageHeader, Stat, useToast } from '../components/ui';
import { JournalLinkBadge } from '../components/JournalPreviewPill';

export function VatReportPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const [settling, setSettling] = useState(false);
  const periodsQuery = usePeriods();
  const periods = periodsQuery.data || [];
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('');
  const currentIsoDate = new Date().toISOString().slice(0, 10);
  const defaultPeriod =
    periods.find((p: any) => !p.isAdjustmentPeriod && p.status === 'OPEN' && String(p.startDate || '').slice(0, 10) <= currentIsoDate && String(p.endDate || '').slice(0, 10) >= currentIsoDate) ||
    periods.find((p: any) => !p.isAdjustmentPeriod && String(p.startDate || '').slice(0, 10) <= currentIsoDate && String(p.endDate || '').slice(0, 10) >= currentIsoDate) ||
    periods.find((p: any) => p.status === 'OPEN') ||
    periods[0];
  const activePeriodId = selectedPeriodId || defaultPeriod?.id || '';

  // Fetch sales invoices
  const salesQuery = useQuery({
    queryKey: ['/invoices', 'vat-report', activePeriodId],
    queryFn: () => api.get<any>('/invoices', { fiscalPeriodId: activePeriodId, pageSize: 100 }),
    enabled: Boolean(activePeriodId),
  });

  // Fetch purchase bills
  const purchasesQuery = useQuery({
    queryKey: ['/purchase-invoices', 'vat-report', activePeriodId],
    queryFn: () => api.get<any>('/purchase-invoices', { fiscalPeriodId: activePeriodId, pageSize: 100 }),
    enabled: Boolean(activePeriodId),
  });

  // Fetch VAT settlements history
  const settlementsQuery = useQuery({
    queryKey: ['/vat-return/settlements'],
    queryFn: () => api.get<any>('/vat-return/settlements'),
  });
  const settlements = Array.isArray(settlementsQuery.data)
    ? settlementsQuery.data
    : (settlementsQuery.data?.data ?? []);
  const currentSettlement = settlements.find((s: any) => s.fiscalPeriodId === activePeriodId);

  const handleSettleVat = async () => {
    if (!activePeriodId) return;
    if (!confirm('ترحيل قيد تسوية إقفال ضريبة القيمة المضافة (مخرجات 20201 مقابل مدخلات 1250) وسداد صافي الضريبة لهيئة الزكاة ZATCA من البنك؟')) return;
    setSettling(true);
    try {
      const res: any = await api.post('/vat-return/settle', {
        periodId: activePeriodId,
        payNow: true,
      });
      toast.success(`تم ترحيل قيد تسوية وسداد الضريبة آلياً برقم ${res.journalEntryNo || ''}`);
      qc.invalidateQueries({ queryKey: ['/vat-return/settlements'] });
      qc.invalidateQueries({ queryKey: ['journals'] });
      qc.invalidateQueries({ queryKey: ['/journal-entries'] });
    } catch (e) {
      toast.error(e);
    } finally {
      setSettling(false);
    }
  };

  const rawSales = Array.isArray(salesQuery.data) ? salesQuery.data : (salesQuery.data?.data || []);
  const rawPurchases = Array.isArray(purchasesQuery.data) ? purchasesQuery.data : (purchasesQuery.data?.data || []);
  const sales = rawSales.filter((inv: any) => inv.status === 'POSTED');
  const purchases = rawPurchases.filter((bill: any) => bill.status === 'POSTED');

  // Calculations (posted documents only; credit/debit notes reduce the respective VAT ledger)
  const getDocSign = (doc: any) => (doc.invoiceType === 'CREDIT_NOTE' || doc.invoiceType === 'DEBIT_NOTE' ? -1 : 1);
  const salesSubtotal = sales.reduce((acc: number, inv: any) => acc + Number(inv.subtotalBase || inv.subtotal || 0) * getDocSign(inv), 0);
  const salesVat = sales.reduce((acc: number, inv: any) => acc + Number(inv.vatAmountBase || inv.vatAmount || 0) * getDocSign(inv), 0);

  const purchasesSubtotal = purchases.reduce((acc: number, bill: any) => acc + Number(bill.subtotalBase || bill.subtotal || 0) * getDocSign(bill), 0);
  const purchasesVat = purchases.reduce((acc: number, bill: any) => acc + Number(bill.vatAmountBase || bill.vatAmount || 0) * getDocSign(bill), 0);

  const netVatPayable = salesVat - purchasesVat;
  const isPayable = netVatPayable >= 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="تقرير الإقرار الضريبي ومطابقة الزكاة (ZATCA VAT Return)"
        subtitle="ملخص ضريبة القيمة المضافة المحصلة على المبيعات (المخرجات) والمسددة على المشتريات (المدخلات) واحتساب صافي الضريبة الواجب سدادها لهيئة الزكاة والضريبة والجمارك."
        icon={ShieldCheck}
        badge={
          <Badge color="green" dot>
            ضريبة القيمة المضافة 15%
          </Badge>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            {currentSettlement ? (
              <div className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 px-3 py-1.5 text-xs font-extrabold text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="size-4 text-emerald-600" />
                <span>تمت التسوية:</span>
                <JournalLinkBadge entryId={currentSettlement.journalEntryId} entryNo={currentSettlement.journalEntryNo} compact />
              </div>
            ) : (salesVat > 0 || purchasesVat > 0) ? (
              <button
                type="button"
                disabled={settling}
                onClick={handleSettleVat}
                className="btn-primary text-xs flex items-center gap-1.5"
                title="توليد وترحيل قيد تسوية وسداد ضريبة القيمة المضافة تلقائياً"
              >
                <Sparkles className="size-3.5" />
                <span>{settling ? 'جارٍ الترحيل الآلي...' : 'ترحيل قيد تسوية وسداد الضريبة آلياً'}</span>
              </button>
            ) : null}
            <ExportMenu
              title="الإقرار الضريبي لضريبة القيمة المضافة (ZATCA VAT 15%)"
              subtitle="ملخص ضريبة المخرجات وضريبة المدخلات وصافي الضريبة المستحقة لهيئة الزكاة والضريبة والجمارك"
              filename={`zatca-vat-return-${today()}`}
              currency="SAR"
              summaryKpis={[
                { label: 'ضريبة المخرجات (15%)', value: `${money(salesVat)} SAR`, tone: 'indigo' },
                { label: 'ضريبة المدخلات (15%)', value: `${money(purchasesVat)} SAR`, tone: 'emerald' },
                { label: 'صافي الضريبة المستحقة', value: `${money(netVatPayable)} SAR`, tone: netVatPayable >= 0 ? 'rose' : 'emerald' },
              ]}
              columns={[
                { key: 'item', header: 'بند الإقرار الضريبي', width: 36 },
                { key: 'taxable', header: 'المبلغ الخاضع (SAR)', width: 18, type: 'currency' },
                { key: 'rate', header: 'النسبة', width: 10 },
                { key: 'vat', header: 'مبلغ الضريبة (SAR)', width: 18, type: 'currency' },
              ]}
              data={[
                { item: '1. المبيعات الخاضعة للنسبة الأساسية (15%)', taxable: salesSubtotal, rate: '15%', vat: salesVat },
                { item: '2. المشتريات الخاضعة للنسبة الأساسية (15%)', taxable: purchasesSubtotal, rate: '15%', vat: purchasesVat },
                { item: '3. صافي ضريبة القيمة المضافة المستحقة للسداد / (للاسترداد)', taxable: salesSubtotal - purchasesSubtotal, rate: 'صافي', vat: netVatPayable },
              ]}
            />
            <button
              className="btn-secondary text-xs flex items-center gap-1.5"
              onClick={() =>
                void ExportEngine.exportPdf({
                  title: 'الإقرار الضريبي لضريبة القيمة المضافة (ZATCA VAT 15%)',
                  subtitle: 'مطابق لمتطلبات هيئة الزكاة والضريبة والجمارك السعودية — المرحلة الثانية',
                  currency: 'SAR',
                  summaryKpis: [
                    { label: 'المبيعات الخاضعة', value: `${money(salesSubtotal)} SAR`, tone: 'sky' },
                    { label: 'ضريبة المخرجات (15%)', value: `${money(salesVat)} SAR`, tone: 'indigo' },
                    { label: 'ضريبة المدخلات (15%)', value: `${money(purchasesVat)} SAR`, tone: 'emerald' },
                    { label: 'صافي الضريبة', value: `${money(netVatPayable)} SAR`, tone: netVatPayable >= 0 ? 'rose' : 'emerald' },
                  ],
                  columns: [
                    { key: 'item', header: 'بند الإقرار الضريبي', width: 36 },
                    { key: 'taxable', header: 'المبلغ الخاضع (SAR)', width: 18, type: 'currency' },
                    { key: 'rate', header: 'النسبة', width: 10 },
                    { key: 'vat', header: 'مبلغ الضريبة (SAR)', width: 18, type: 'currency' },
                  ],
                  data: [
                    { item: '1. المبيعات الخاضعة للنسبة الأساسية (15%)', taxable: salesSubtotal, rate: '15%', vat: salesVat },
                    { item: '2. المشتريات الخاضعة للنسبة الأساسية (15%)', taxable: purchasesSubtotal, rate: '15%', vat: purchasesVat },
                    { item: '3. صافي ضريبة القيمة المضافة المستحقة للسداد / (للاسترداد)', taxable: salesSubtotal - purchasesSubtotal, rate: 'صافي', vat: netVatPayable },
                  ],
                  signatureLabels: ['المحاسب الضريبي', 'المدير المالي', 'المفوض الضريبي'],
                })
              }
              title="طباعة الإقرار الضريبي الملكي (A4)"
            >
              <Printer className="size-3.5" /> طباعة الإقرار الملكي
            </button>
          </div>
        }
      />

      {/* Period Selector & ZATCA Badge */}
      <div className="card p-4 flex flex-wrap items-center justify-between gap-4 print:hidden">
        <div className="flex items-center gap-3">
          <Calendar className="size-4 text-brand-600" />
          <span className="text-xs font-bold text-slate-700 dark:text-slate-200">الفترة الضريبية / المالية:</span>
          <select
            className="input text-xs py-1.5 px-3 min-w-[220px]"
            value={activePeriodId}
            onChange={(e) => setSelectedPeriodId(e.target.value)}
          >
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.startDate} إلى {p.endDate})
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3.5 py-1.5 border border-emerald-200 text-xs text-emerald-800 font-semibold dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300">
          <ShieldCheck className="size-4 text-emerald-600" />
          <span>مطابق لمتطلبات الفوترة الإلكترونية وهيئة الزكاة والضريبة والجمارك (المرحلة الثانية)</span>
        </div>
      </div>

      {/* Top 4 KPI Metrics */}
      <div className="grid grid-cols-2 gap-3.5 md:grid-cols-4">
        <Stat
          label="إجمالي المبيعات الخاضعة للضريبة"
          value={money(salesSubtotal)}
          hint={`${sales.length} فواتير مبيعات ضريبية`}
          tone="cyan"
          icon={TrendingUp}
        />
        <Stat
          label="ضريبة المخرجات (المبيعات 15%)"
          value={money(salesVat)}
          hint="حساب 2400 ضريبة مستحقة"
          tone="blue"
          icon={Receipt}
        />
        <Stat
          label="ضريبة المدخلات (المشتريات 15%)"
          value={money(purchasesVat)}
          hint="حساب 1250 ضريبة قابلة للخصم"
          tone="amber"
          icon={TrendingDown}
        />
        <Stat
          label="صافي الضريبة واجبة السداد"
          value={money(netVatPayable)}
          hint={isPayable ? 'مستحق السداد لهيئة الزكاة' : 'رصيد ضريبي دائن مسترد'}
          tone={isPayable ? 'green' : 'purple'}
          icon={Landmark}
        />
      </div>

      {/* ZATCA VAT Analytics Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 print:hidden">
        <ExecutiveChartCard
          title="مقارنة ضريبة المخرجات مقابل المدخلات وصافي المستحق"
          subtitle="ملخص المركز الضريبي للفترة بالريال السعودي (ZATCA 15%)"
          icon={BarChart3}
          accent="emerald"
          className="lg:col-span-2"
        >
          <ExecutiveBarChart
            categories={['ضريبة المخرجات (مبيعات)', 'ضريبة المدخلات (مشتريات)', 'صافي الضريبة المستحقة']}
            series={[
              {
                name: 'مبلغ الضريبة (SAR)',
                data: [salesVat, purchasesVat, netVatPayable],
                color: '#10b981',
                colorEnd: '#059669',
              },
            ]}
            height={220}
            unit="SAR"
            emptyText="لا توجد حركات ضريبية مرحّلة لهذه الفترة"
          />
        </ExecutiveChartCard>

        <ExecutiveChartCard
          title="توزيع الوعاء الخاضع للضريبة"
          subtitle="المبيعات الخاضعة مقابل المشتريات الخاضعة للضريبة"
          icon={PieChart}
          accent="indigo"
        >
          <ExecutiveDonutChart
            data={[
              { name: 'مبيعات خاضعة 15%', value: Math.max(0, salesSubtotal), color: '#4f46e5' },
              { name: 'مشتريات خاضعة 15%', value: Math.max(0, purchasesSubtotal), color: '#f59e0b' },
            ]}
            centerValue={money(netVatPayable)}
            centerLabel="صافي الضريبة"
            height={220}
            unit="SAR"
            emptyText="لا توجد معاملات"
          />
        </ExecutiveChartCard>
      </div>

      {/* Official ZATCA VAT Return Table */}
      <div className="card overflow-hidden">
        <div className="border-b border-slate-200 p-4 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-900/60 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white text-base">
              جدول إقرار ضريبة القيمة المضافة (نموذج الهيئة)
            </h3>
            <p className="text-xs text-slate-500">
              المبالغ مقاسة بالريال السعودي ومحسوبة تلقائياً من الفواتير والقيود المرحلة
            </p>
          </div>
          <Badge color={isPayable ? 'green' : 'blue'}>
            {isPayable ? 'واجب السداد' : 'رصيد دائن مسترد'}
          </Badge>
        </div>

        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th className="w-16 text-center">#</th>
                <th>بند الإقرار الضريبي</th>
                <th className="num">المبلغ الخاضع للضريبة</th>
                <th className="num">نسبة الضريبة</th>
                <th className="num">مبلغ الضريبة</th>
                <th>الحساب المحاسبي المرتبط</th>
              </tr>
            </thead>
            <tbody>
              {/* Sales Section */}
              <tr className="bg-blue-50/40 dark:bg-blue-950/20 font-bold">
                <td colSpan={6} className="text-blue-900 dark:text-blue-200 text-xs">
                  أولاً: ضريبة المبيعات والمخرجات (Output VAT)
                </td>
              </tr>
              <tr>
                <td className="text-center font-mono font-bold">1</td>
                <td>
                  <div className="font-bold text-slate-900 dark:text-slate-100">
                    المبيعات الخاضعة للنسبة الأساسية (15%)
                  </div>
                  <div className="text-xs text-slate-500">
                    عقود المشاريع، تأجير المطورين، الخدمات البرمجية والاستشارية
                  </div>
                </td>
                <td className="num font-semibold">{money(salesSubtotal)}</td>
                <td className="num">15%</td>
                <td className="num font-bold text-blue-700 dark:text-blue-400">{money(salesVat)}</td>
                <td className="text-xs font-mono">2400 (ضريبة المبيعات المستحقة)</td>
              </tr>

              {/* Purchases Section */}
              <tr className="bg-amber-50/40 dark:bg-amber-950/20 font-bold">
                <td colSpan={6} className="text-amber-900 dark:text-amber-200 text-xs">
                  ثانياً: ضريبة المشتريات والمدخلات (Input VAT)
                </td>
              </tr>
              <tr>
                <td className="text-center font-mono font-bold">2</td>
                <td>
                  <div className="font-bold text-slate-900 dark:text-slate-100">
                    المشتريات والمصروفات الخاضعة للنسبة الأساسية (15%)
                  </div>
                  <div className="text-xs text-slate-500">
                    استضافة السحابة، تراخيص البرمجيات، أجهزة ومعدات المطورين، مقاولو الباطن
                  </div>
                </td>
                <td className="num font-semibold">{money(purchasesSubtotal)}</td>
                <td className="num">15%</td>
                <td className="num font-bold text-amber-700 dark:text-amber-400">{money(purchasesVat)}</td>
                <td className="text-xs font-mono">1250 (ضريبة المدخلات القابلة للخصم)</td>
              </tr>

              {/* Net Payable Row */}
              <tr className="bg-slate-100/80 dark:bg-slate-800 font-black text-sm">
                <td className="text-center font-mono font-bold">3</td>
                <td>
                  <div className="font-black text-slate-950 dark:text-white">
                    صافي ضريبة القيمة المضافة المستحقة للسداد / (للاسترداد)
                  </div>
                  <div className="text-xs text-slate-500 font-normal">
                    (إجمالي ضريبة المخرجات رقم 1 - إجمالي ضريبة المدخلات رقم 2)
                  </div>
                </td>
                <td className="num font-bold">{money(salesSubtotal - purchasesSubtotal)}</td>
                <td className="num">—</td>
                <td className={`num font-black text-base ${isPayable ? 'text-emerald-700 dark:text-emerald-400' : 'text-blue-700 dark:text-blue-400'}`}>
                  {money(netVatPayable)}
                </td>
                <td className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isPayable ? 'سداد لهيئة الزكاة (ZATCA)' : 'رصيد دائن ينقل للفترة التالية'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Official Signatures for Printing */}
      <div className="hidden print:block pt-10 border-t border-slate-300">
        <div className="grid grid-cols-3 gap-6 text-center text-xs">
          <div>
            <div className="font-bold mb-10">إعداد / محاسب الضرائب</div>
            <div className="border-t border-slate-400 w-36 mx-auto pt-1">التوقيع والتاريخ</div>
          </div>
          <div>
            <div className="font-bold mb-10">مراجعة / مدير الحسابات العام</div>
            <div className="border-t border-slate-400 w-36 mx-auto pt-1">التوقيع والتاريخ</div>
          </div>
          <div>
            <div className="font-bold mb-10">اعتماد / المدير المالي (CFO)</div>
            <div className="border-t border-slate-400 w-36 mx-auto pt-1">التوقيع والختم</div>
          </div>
        </div>
      </div>
    </div>
  );
}
