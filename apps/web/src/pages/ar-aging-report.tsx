import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart3, Calendar, PieChart, Printer, RefreshCw, Search, ShieldAlert, Wallet
} from 'lucide-react';
import { api } from '../lib/api';
import { useBaseCurrency } from '../lib/auth';
import { money, today } from '../lib/format';
import { ExecutiveBarChart, ExecutiveChartCard, ExecutiveDonutChart } from '../components/ExecutiveCharts';
import { ExportMenu } from '../components/ExportMenu';
import { TreasuryPaymentModal } from '../components/TreasuryPaymentModal';
import { Badge, EmptyState, ErrorState, Loading, PageHeader, Stat } from '../components/ui';

export interface AgingBucketRow {
  clientId: string;
  clientCode: string;
  clientNameAr: string;
  projectCount: number;
  totalReceivable: number;
  current0to30: number;
  days31to60: number;
  days61to90: number;
  over90: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  lastInvoiceDate: string;
  contactPerson?: string;
  phone?: string;
}

export function AccountsReceivableAgingReportPage() {
  const qc = useQueryClient();
  const base = useBaseCurrency();
  const [asOfDate, setAsOfDate] = useState(today());
  const [riskFilter, setRiskFilter] = useState<'ALL' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'>('ALL');
  const [search, setSearch] = useState('');
  const [collectingInv, setCollectingInv] = useState<any | null>(null);

  // Queries: Clients and Invoices
  const { data: clients = [], isLoading: isClientsLoading, error: clientsError, refetch } = useQuery({
    queryKey: ['ar-clients'],
    queryFn: () => api.get<any[]>('/clients', { pageSize: '100' }).then((r: any) => r.data || []),
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ['ar-invoices', asOfDate],
    queryFn: () => api.get<any[]>('/invoices', { pageSize: '200' }).then((r: any) => r.data || []).catch(() => []),
  });

  // Calculate Aging Data from real invoices strictly
  const agingData = useMemo<AgingBucketRow[]>(() => {
    const asOfMs = new Date(asOfDate).getTime();

    return clients.map((cl: any, idx: number) => {
      const clientInvoices = invoices.filter(
        (inv: any) => (inv.clientId === cl.id || inv.client_id === cl.id || inv.clientName === cl.nameAr) && inv.status !== 'CANCELLED' && inv.status !== 'DRAFT'
      );

      let current0to30 = 0;
      let days31to60 = 0;
      let days61to90 = 0;
      let over90 = 0;
      let creditNotesDeduction = 0;
      let latestDate = '—';

      for (const inv of clientInvoices) {
        if (inv.invoiceType === 'CREDIT_NOTE') {
          creditNotesDeduction += Number(inv.totalAmountBase || inv.totalAmount || 0);
          continue;
        }
        const total = Number(inv.totalAmountBase || inv.totalAmount || inv.total_amount || 0);
        const paid = Number(inv.paidAmount || inv.paid_amount || 0);
        const unpaid = Math.max(0, total - paid);
        if (unpaid <= 0) continue;

        const invDateStr = inv.issueDate || inv.issue_date || inv.date || asOfDate;
        if (latestDate === '—' || invDateStr > latestDate) latestDate = invDateStr;

        const diffDays = Math.max(0, Math.floor((asOfMs - new Date(invDateStr).getTime()) / (1000 * 60 * 60 * 24)));
        if (diffDays <= 30) current0to30 += unpaid;
        else if (diffDays <= 60) days31to60 += unpaid;
        else if (diffDays <= 90) days61to90 += unpaid;
        else over90 += unpaid;
      }

      // Apply credit notes against oldest buckets first
      let remCr = creditNotesDeduction;
      for (const apply of [
        () => { const d = Math.min(over90, remCr); over90 -= d; remCr -= d; },
        () => { const d = Math.min(days61to90, remCr); days61to90 -= d; remCr -= d; },
        () => { const d = Math.min(days31to60, remCr); days31to60 -= d; remCr -= d; },
        () => { const d = Math.min(current0to30, remCr); current0to30 -= d; remCr -= d; },
      ]) {
        if (remCr > 0) apply();
      }

      const baseReceivable = current0to30 + days31to60 + days61to90 + over90;

      let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
      if (over90 > 25000) riskLevel = 'CRITICAL';
      else if (days61to90 > 15000) riskLevel = 'HIGH';
      else if (days31to60 > 20000) riskLevel = 'MEDIUM';

      return {
        clientId: cl.id,
        clientCode: cl.code || `CL-${idx + 101}`,
        clientNameAr: cl.name_ar || cl.nameAr || 'عميل تعاقدي',
        projectCount: Number(cl.projectCount || cl.activeProjectsCount || 0),
        totalReceivable: baseReceivable,
        current0to30,
        days31to60,
        days61to90,
        over90,
        riskLevel,
        lastInvoiceDate: latestDate,
        contactPerson: cl.contact_person || cl.contactPerson || '—',
        phone: cl.phone || '—',
      };
    });
  }, [clients, invoices, asOfDate]);

  // Filtered rows
  const filteredRows = useMemo(() => {
    return agingData.filter((r) => {
      if (riskFilter !== 'ALL' && r.riskLevel !== riskFilter) return false;
      if (search) {
        const q = search.trim().toLowerCase();
        if (!r.clientNameAr.toLowerCase().includes(q) && !r.clientCode.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [agingData, riskFilter, search]);

  // Overall totals
  const totals = useMemo(() => {
    let total = 0;
    let b0 = 0;
    let b30 = 0;
    let b60 = 0;
    let b90 = 0;

    for (const r of agingData) {
      total += r.totalReceivable;
      b0 += r.current0to30;
      b30 += r.days31to60;
      b60 += r.days61to90;
      b90 += r.over90;
    }

    return { total, b0, b30, b60, b90 };
  }, [agingData]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="تقرير أعمار ديون العملاء والتحصيلات (Accounts Receivable Aging)"
        subtitle="تحليل مستحقات عقود البرمجة والخدمات حسب فترات التأخير (0-30، 31-60، 61-90، وأكثر من 90 يوماً) لإدارة التدفقات النقدية وخفض مخاطر التعثر"
        icon={Wallet}
        badge={
          <Badge color="amber" dot>
            {filteredRows.length} عميل
          </Badge>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => refetch()}
              className="btn-secondary text-xs flex items-center gap-1.5"
            >
              <RefreshCw className="size-3.5" />
              تحديث
            </button>
            <ExportMenu
              title="تقرير أعمار ديون العملاء والتحصيلات"
              filename={`ar-aging-${asOfDate}`}
              periodLabel={`كما في ${asOfDate}`}
              currency={base}
              columns={[
                { key: 'clientCode', header: 'كود العميل', width: 14 },
                { key: 'clientNameAr', header: 'اسم العميل', width: 26 },
                { key: 'totalReceivable', header: `إجمالي المستحق (${base})`, width: 18, type: 'currency', isTotal: true },
                { key: 'current0to30', header: 'حالي (0-30 يوم)', width: 16, type: 'currency', isTotal: true },
                { key: 'days31to60', header: 'متأخر (31-60)', width: 16, type: 'currency', isTotal: true },
                { key: 'days61to90', header: 'متأخر (61-90)', width: 16, type: 'currency', isTotal: true },
                { key: 'over90', header: 'متعثر (+90 يوم)', width: 16, type: 'currency', isTotal: true },
                { key: 'riskLevel', header: 'درجة المخاطرة', width: 14 },
              ]}
              data={filteredRows}
            />
            <button
              onClick={() => window.print()}
              className="btn-primary text-xs flex items-center gap-1.5"
            >
              <Printer className="size-3.5" />
              طباعة التقرير
            </button>
          </div>
        }
      />

      {/* Executive KPI Cards Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        <Stat label="إجمالي مستحقات العملاء" value={`${money(totals.total)} ${base}`} tone="indigo" icon={Wallet} hint="كافة الفواتير غير المحصلة" />
        <Stat label="حالي (0 - 30 يوماً)" value={`${money(totals.b0)} ${base}`} tone="green" progress={totals.total > 0 ? Math.round((totals.b0 / totals.total) * 100) : 0} hint={`${totals.total > 0 ? Math.round((totals.b0 / totals.total) * 100) : 0}% من إجمالي المستحقات`} />
        <Stat label="متأخر (31 - 60 يوماً)" value={`${money(totals.b30)} ${base}`} tone="blue" progress={totals.total > 0 ? Math.round((totals.b30 / totals.total) * 100) : 0} hint="قيد المتابعة والتحصيل" />
        <Stat label="متأخر (61 - 90 يوماً)" value={`${money(totals.b60)} ${base}`} tone="amber" progress={totals.total > 0 ? Math.round((totals.b60 / totals.total) * 100) : 0} hint="يتطلب إشعار مطالبة رسمي" />
        <Stat label="متعثر (+90 يوماً)" value={`${money(totals.b90)} ${base}`} tone="red" icon={ShieldAlert} progress={totals.total > 0 ? Math.round((totals.b90 / totals.total) * 100) : 0} hint="مخاطر تعثر عالية" />
      </div>

      {/* AR Aging Visual Analytics Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 print:hidden">
        <ExecutiveChartCard
          title="توزيع أعمار الذمم المدينة حسب فترات التأخير"
          subtitle={`مقارنة الشرائح الزمنية للمستحقات (${base})`}
          icon={BarChart3}
          accent="indigo"
          className="lg:col-span-2"
        >
          <ExecutiveBarChart
            categories={['حالي (0-30 يوم)', 'متأخر (31-60 يوم)', 'متأخر (61-90 يوم)', 'متعثر (+90 يوم)']}
            series={[
              {
                name: `المستحق (${base})`,
                data: [totals.b0, totals.b30, totals.b60, totals.b90],
                color: '#4f46e5',
                colorEnd: '#0ea5e9',
              },
            ]}
            height={220}
            unit={base}
            emptyText="لا توجد مستحقات غير محصلة حالياً"
          />
        </ExecutiveChartCard>

        <ExecutiveChartCard
          title="تصنيف العملاء حسب درجة المخاطرة"
          subtitle="نسبة العملاء الآمنين مقابل ذوي المخاطر المرتفعة"
          icon={PieChart}
          accent="amber"
        >
          <ExecutiveDonutChart
            data={[
              { name: 'منخفضة (آمن)', value: agingData.filter((r) => r.riskLevel === 'LOW').length, color: '#10b981' },
              { name: 'متوسطة', value: agingData.filter((r) => r.riskLevel === 'MEDIUM').length, color: '#0ea5e9' },
              { name: 'عالية', value: agingData.filter((r) => r.riskLevel === 'HIGH').length, color: '#f59e0b' },
              { name: 'حرجة (+90 يوم)', value: agingData.filter((r) => r.riskLevel === 'CRITICAL').length, color: '#f43f5e' },
            ]}
            centerValue={String(agingData.length)}
            centerLabel="عملاء التحليل"
            height={220}
            unit="عميل"
            emptyText="لا يوجد عملاء"
          />
        </ExecutiveChartCard>
      </div>

      {/* Filter and Date Strip */}
      <div className="card p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Calendar className="size-4 text-slate-500" />
          <span className="text-xs font-bold text-slate-800 dark:text-slate-200">تاريخ احتساب الاستحقاق (As of Date):</span>
          <input
            type="date"
            className="input text-xs py-1.5 w-36 font-mono"
            value={asOfDate}
            onChange={(e) => setAsOfDate(e.target.value)}
          />
        </div>

        {/* Search */}
        <div className="flex-1 max-w-xs">
          <div className="relative">
            <input
              type="text"
              placeholder="ابحث باسم العميل أو الكود…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input text-xs w-full ps-8 py-1.5"
            />
            <Search className="size-3.5 text-slate-400 absolute start-2.5 top-1/2 -translate-y-1/2" />
          </div>
        </div>

        {/* Risk Tabs */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-slate-500 me-1">تصنيف المخاطر:</span>
          {[
            { id: 'ALL', label: 'كافة العملاء' },
            { id: 'CRITICAL', label: 'متعثر (+90)' },
            { id: 'HIGH', label: 'مخاطر عالية' },
            { id: 'MEDIUM', label: 'متوسط' },
            { id: 'LOW', label: 'منتظم' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setRiskFilter(tab.id as any)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                riskFilter === tab.id
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Table */}
      {isClientsLoading ? (
        <div className="p-12 text-center"><Loading /></div>
      ) : clientsError ? (
        <div className="p-8"><ErrorState error={clientsError} /></div>
      ) : filteredRows.length === 0 ? (
        <div className="p-12 text-center card">
          <EmptyState text="لا توجد بيانات مستحقات أو ديون مطابقة للفلاتر المحددة." />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto custom-scrollbar">
            <table className="table w-full text-right text-xs">
              <thead>
                <tr>
                  <th>كود</th>
                  <th>اسم العميل ومسؤول الحساب</th>
                  <th className="text-center">المشاريع</th>
                  <th className="text-center font-black">إجمالي المستحق</th>
                  <th className="text-center">حالي (0 - 30)</th>
                  <th className="text-center">متأخر (31 - 60)</th>
                  <th className="text-center">متأخر (61 - 90)</th>
                  <th className="text-center font-bold">متعثر (+90 يوم)</th>
                  <th className="text-center">مستوى المخاطرة</th>
                  <th className="text-end">التحصيل</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => {
                  const firstUnpaidInv = invoices.find(
                    (inv: any) =>
                      (inv.clientId === row.clientId || inv.clientName === row.clientNameAr) &&
                      inv.status === 'POSTED' &&
                      inv.invoiceType !== 'CREDIT_NOTE' &&
                      Number(inv.totalAmount || 0) > Number(inv.paidAmount || 0),
                  );
                  return (
                    <tr key={row.clientId}>
                      <td className="font-mono font-bold text-slate-600 dark:text-slate-300">{row.clientCode}</td>
                      <td>
                        <div className="font-bold text-slate-900 dark:text-white">{row.clientNameAr}</div>
                        <div className="text-[11px] text-slate-500 font-medium">
                          {row.contactPerson} • {row.phone}
                        </div>
                      </td>
                      <td className="text-center font-mono font-bold">{row.projectCount}</td>
                      <td className="text-center font-mono font-black text-slate-950 dark:text-white text-sm">
                        {money(row.totalReceivable)} {base}
                      </td>
                      <td className="text-center font-mono font-bold text-emerald-700 dark:text-emerald-400">
                        {row.current0to30 > 0 ? `${money(row.current0to30)}` : '—'}
                      </td>
                      <td className="text-center font-mono font-bold text-blue-700 dark:text-blue-400">
                        {row.days31to60 > 0 ? `${money(row.days31to60)}` : '—'}
                      </td>
                      <td className="text-center font-mono font-bold text-amber-600 dark:text-amber-400">
                        {row.days61to90 > 0 ? `${money(row.days61to90)}` : '—'}
                      </td>
                      <td className="text-center font-mono font-black text-rose-600 dark:text-rose-400">
                        {row.over90 > 0 ? `${money(row.over90)}` : '—'}
                      </td>
                      <td className="text-center">
                        {row.riskLevel === 'LOW' && <Badge color="green">منتظم</Badge>}
                        {row.riskLevel === 'MEDIUM' && <Badge color="blue">متوسط</Badge>}
                        {row.riskLevel === 'HIGH' && <Badge color="amber">مخاطر عالية</Badge>}
                        {row.riskLevel === 'CRITICAL' && <Badge color="red">شديد التعثر</Badge>}
                      </td>
                      <td className="text-end">
                        {firstUnpaidInv ? (
                          <button
                            type="button"
                            onClick={() => setCollectingInv(firstUnpaidInv)}
                            className="btn-primary h-7 px-2.5 text-[11px] gap-1"
                            title={`سند قبض وتوليد قيد تحصيل للفاتورة ${firstUnpaidInv.invoiceNo}`}
                          >
                            <Wallet className="size-3" /> تحصيل
                          </button>
                        ) : (
                          <Link to="/sal/invoices" className="text-[11px] font-bold text-indigo-600 hover:underline">
                            الفواتير
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} className="text-start font-bold">
                    الإجمالي العام لمستحقات وأعمار ديون العملاء ({base}):
                  </td>
                  <td className="text-center font-mono font-black text-sm">
                    {money(totals.total)} {base}
                  </td>
                  <td className="text-center font-mono font-black text-emerald-700 dark:text-emerald-400">
                    {money(totals.b0)} {base}
                  </td>
                  <td className="text-center font-mono font-black text-blue-700 dark:text-blue-400">
                    {money(totals.b30)} {base}
                  </td>
                  <td className="text-center font-mono font-black text-amber-700 dark:text-amber-400">
                    {money(totals.b60)} {base}
                  </td>
                  <td className="text-center font-mono font-black text-rose-700 dark:text-rose-400">
                    {money(totals.b90)} {base}
                  </td>
                  <td colSpan={2} className="text-center text-slate-500 font-mono">100%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {collectingInv && (
        <TreasuryPaymentModal
          open={Boolean(collectingInv)}
          mode="RECEIPT"
          invoiceId={collectingInv.id}
          invoiceNo={collectingInv.invoiceNo}
          partyName={collectingInv.clientName}
          totalAmount={Number(collectingInv.totalAmount || 0)}
          paidAmount={Number(collectingInv.paidAmount || 0)}
          currencyCode={collectingInv.currencyCode || base}
          onClose={() => setCollectingInv(null)}
          onSuccess={() => {
            setCollectingInv(null);
            refetch();
            qc.invalidateQueries({ queryKey: ['/invoices'] });
            qc.invalidateQueries({ queryKey: ['journals'] });
          }}
        />
      )}
    </div>
  );
}
