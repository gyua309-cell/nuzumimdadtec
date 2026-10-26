import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Calendar, Download, Landmark,
  Printer, Receipt, ShieldCheck, TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { api } from '../lib/api';
import { downloadCsv, money, today } from '../lib/format';
import { usePeriods } from '../components/forms';
import { Badge, PageHeader, Stat, useToast } from '../components/ui';

export function VatReportPage() {
  const toast = useToast();
  const periodsQuery = usePeriods();
  const periods = periodsQuery.data || [];
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('');
  const activePeriodId = selectedPeriodId || periods[0]?.id || '';

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

  const sales = salesQuery.data?.data || [];
  const purchases = purchasesQuery.data?.data || [];

  // Calculations
  const salesSubtotal = sales.reduce((acc: number, inv: any) => acc + Number(inv.subtotal || 0), 0);
  const salesVat = sales.reduce((acc: number, inv: any) => acc + Number(inv.vatAmount || 0), 0);

  const purchasesSubtotal = purchases.reduce((acc: number, bill: any) => acc + Number(bill.subtotal || 0), 0);
  const purchasesVat = purchases.reduce((acc: number, bill: any) => acc + Number(bill.vatAmount || 0), 0);

  const netVatPayable = salesVat - purchasesVat;
  const isPayable = netVatPayable >= 0;

  const handleExportCsv = () => {
    downloadCsv(`zatca-vat-return-${today()}.csv`, [
      ['بند الإقرار الضريبي', 'المبلغ الخاضع للضريبة (ر.س)', 'نسبة الضريبة %', 'مبلغ الضريبة (ر.س)'],
      ['1. المبيعات الخاضعة للنسبة الأساسية (15%)', salesSubtotal.toFixed(2), '15%', salesVat.toFixed(2)],
      ['2. المشتريات الخاضعة للنسبة الأساسية (15%)', purchasesSubtotal.toFixed(2), '15%', purchasesVat.toFixed(2)],
      ['3. صافي ضريبة القيمة المضافة المستحقة للسداد / (للاسترداد)', '', '', netVatPayable.toFixed(2)],
    ]);
    toast.success('تم تصدير مسودة الإقرار الضريبي إلى ملف CSV بنجاح');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="تقرير الإقرار الضريبي ومطابقة الزكاة (ZATCA VAT Return)"
        subtitle="ملخص ضريبة القيمة المضافة المحصلة على المبيعات (المخرجات) والمسددة على المشتريات (المدخلات) واحتساب صافي الضريبة الواجب سدادها لهيئة الزكاة والضريبة والجمارك."
        actions={
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <button
              className="btn btn-secondary text-xs flex items-center gap-1.5"
              onClick={() => window.print()}
              title="طباعة الإقرار الضريبي"
            >
              <Printer className="size-3.5" /> طباعة الإقرار
            </button>
            <button
              className="btn btn-secondary text-xs flex items-center gap-1.5"
              onClick={handleExportCsv}
              title="تصدير إلى Excel / CSV"
            >
              <Download className="size-3.5" /> تصدير Excel / CSV
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
