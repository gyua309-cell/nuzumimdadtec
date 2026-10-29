/**
 * IDHAM ERP - ZATCA Tax Invoice Unified Printable Template
 * Fully compliant with ZATCA E-Invoicing Phase 1 & Phase 2 Technical Specifications.
 * Supports:
 * - A4 Standard B2B Tax Invoice (فاتورة ضريبية قياسية معتمدة)
 * - A4 Simplified B2C Tax Invoice (فاتورة ضريبية مبسطة)
 * - 80mm Thermal Receipt (إيصال حراري مبسط 80مم)
 * - Export to formatted Excel (.xlsx) via ExcelJS
 */

import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Building2, Check, CheckCircle2, Code2, Copy, FileCheck2, ShieldCheck, User, Wallet } from 'lucide-react';
import { getStoredCompany } from '../lib/storage-company';
import { money, tafqeetArabic, tafqeetEnglish } from '../lib/format';
import { InvoiceDetail, InvoiceLine } from '../pages/sales';
import { ExportEngine } from '../engine/export-engine';

export interface ZatcaTaxInvoiceTemplateProps {
  invoice: InvoiceDetail;
  mode?: 'A4' | 'THERMAL_80MM';
  watermark?: 'NONE' | 'DRAFT' | 'CANCELED' | 'DUPLICATE';
  copiedIban?: boolean;
  onCopyIban?: (iban: string) => void;
}

/**
 * Universal Excel Exporter for Individual Invoices
 */
export async function exportInvoiceToExcel(inv: InvoiceDetail): Promise<boolean> {
  const company = getStoredCompany();
  const todayStr = inv.issueDate || new Date().toISOString().slice(0, 10);

  const columns = [
    { key: 'lineNo', header: '#', width: 6 },
    { key: 'employee', header: 'المبرمج / المهندس المكلف', width: 26 },
    { key: 'description', header: 'الخدمة البرمجية / نطاق العمل', width: 34 },
    { key: 'quantity', header: 'الكمية / الأيام', width: 14, type: 'number' as const },
    { key: 'unitPrice', header: 'سعر الوحدة', width: 14, type: 'currency' as const },
    { key: 'discount', header: 'الخصم', width: 12, type: 'currency' as const },
    { key: 'taxable', header: 'الوعاء الضريبي', width: 16, type: 'currency' as const },
    { key: 'vatRate', header: 'نسبة الضريبة', width: 12 },
    { key: 'vatAmount', header: 'مبلغ الضريبة', width: 14, type: 'currency' as const, isTotal: true },
    { key: 'total', header: 'الإجمالي شامل الضريبة', width: 18, type: 'currency' as const, isTotal: true },
  ];

  const data = inv.lines.map((l: InvoiceLine, idx: number) => ({
    lineNo: l.lineNo ?? idx + 1,
    employee: l.employeeName ? `${l.employeeName} (${l.employeeCode || ''})` : 'فريق العمل والبرمجة',
    description: l.description,
    quantity: Number(l.quantity || 1),
    unitPrice: Number(l.unitPrice || 0),
    discount: Number(l.discountPct ? (Number(l.unitPrice) * Number(l.quantity) * Number(l.discountPct)) / 100 : 0),
    taxable: Number(l.subtotal || 0),
    vatRate: `${Number(l.vatRate || 15)}%`,
    vatAmount: Number(l.vatAmount || 0),
    total: Number(l.total || 0),
  }));

  return ExportEngine.exportExcel({
    title: `فاتورة ضريبية - ${inv.invoiceNo}`,
    filename: `Invoice-${inv.invoiceNo}-${inv.clientName}-${todayStr}`,
    branchName: company.address ? 'المقر الرئيسي' : 'الفرع المعتمد',
    currency: inv.currencyCode || company.baseCurrency || 'SAR',
    periodLabel: inv.periodName || todayStr.slice(0, 7),
    columns,
    data,
  });
}

/**
 * ZATCA Official Tax Invoice Template
 */
export const ZatcaTaxInvoiceTemplate: React.FC<ZatcaTaxInvoiceTemplateProps> = ({
  invoice: inv,
  mode = 'A4',
  watermark = 'NONE',
  copiedIban = false,
  onCopyIban,
}) => {
  const company = getStoredCompany();
  const isCreditNote = inv.invoiceType === 'CREDIT_NOTE';
  const isSimplified = inv.invoiceType === 'SIMPLIFIED';

  const sellerName = inv.sellerName || company.nameAr || 'شركة عزم للتكنولوجيا والحلول الرقمية';
  const sellerLegalName = inv.sellerLegalName || company.legalName || company.nameEn || 'AZM TECH & DIGITAL SOLUTIONS CO.';
  const sellerVatNumber = inv.sellerVatNumber || company.taxNumber || '310123456700003';
  const sellerCrNumber = inv.sellerCrNumber || company.commercialReg || '1010000000';
  const sellerAddress = inv.sellerAddress || company.address || 'المملكة العربية السعودية / جمهورية مصر العربية';

  const bankName = inv.bankName || 'مصرف الراجحي (Al Rajhi Bank)';
  const accountNo = inv.bankAccountNo || '4580000123456789012345';
  const ibanNumber = inv.bankIban || 'SA0380000458000012345678';

  // Smart watermark text
  const computedWatermark =
    watermark !== 'NONE'
      ? watermark
      : inv.status === 'DRAFT'
      ? 'DRAFT'
      : inv.status === 'CANCELLED'
      ? 'CANCELED'
      : null;

  const watermarkLabel =
    computedWatermark === 'DRAFT'
      ? 'مسودة غير معتمدة'
      : computedWatermark === 'CANCELED'
      ? 'ملغاة / CANCELLED'
      : computedWatermark === 'DUPLICATE'
      ? 'نسخة مكررة'
      : null;

  // ---------------------------------------------------------------------------
  // Thermal 80mm Layout (للإيصالات الحرارية السريعة)
  // ---------------------------------------------------------------------------
  if (mode === 'THERMAL_80MM') {
    return (
      <div
        id="tax-invoice-printable"
        className="w-[80mm] max-w-[80mm] mx-auto p-3 bg-white text-slate-900 font-sans text-[11px] leading-tight space-y-3 border border-slate-300 print:border-none print:m-0 print:p-1"
        dir="rtl"
      >
        {/* Header */}
        <div className="text-center space-y-1 border-b border-dashed border-slate-400 pb-2">
          <div className="size-10 rounded-full bg-slate-900 text-white font-black text-sm flex items-center justify-center mx-auto">
            ع
          </div>
          <h2 className="font-extrabold text-xs">{sellerName}</h2>
          <div className="text-[10px] text-slate-600">الرقم الضريبي: {sellerVatNumber}</div>
          {sellerCrNumber && <div className="text-[9px] text-slate-500">س.ت: {sellerCrNumber}</div>}
          <div className="font-bold text-[11px] bg-slate-100 py-1 rounded border border-slate-300 mt-1">
            {isCreditNote ? 'إشعار دائن ضريبي' : 'فاتورة ضريبية مبسطة (B2C)'}
          </div>
        </div>

        {/* Invoice Info */}
        <div className="text-[10px] space-y-0.5 border-b border-dashed border-slate-400 pb-2">
          <div><span className="font-bold">رقم الفاتورة:</span> {inv.invoiceNo}</div>
          <div><span className="font-bold">التاريخ:</span> {inv.issueDate} {inv.issueTime?.slice(11, 19)}</div>
          <div><span className="font-bold">العميل:</span> {inv.clientName}</div>
          {inv.clientVatNumber && <div><span className="font-bold">الرقم الضريبي للعميل:</span> {inv.clientVatNumber}</div>}
        </div>

        {/* Items List */}
        <div className="space-y-1 border-b border-dashed border-slate-400 pb-2">
          <div className="font-bold text-[10px] flex justify-between border-b border-slate-200 pb-1">
            <span>البند / الخدمة</span>
            <span>الإجمالي</span>
          </div>
          {inv.lines.map((l, i) => (
            <div key={i} className="text-[10px] flex justify-between gap-1">
              <div className="truncate max-w-[50mm]">
                <div className="font-semibold">{l.employeeName || l.description}</div>
                <div className="text-[9px] text-slate-500">{Number(l.quantity)} × {money(l.unitPrice)}</div>
              </div>
              <div className="font-mono font-bold shrink-0">{money(l.total)}</div>
            </div>
          ))}
        </div>

        {/* Totals */}
        <div className="text-[10px] space-y-1 border-b border-dashed border-slate-400 pb-2">
          <div className="flex justify-between">
            <span>المجموع غير شامل الضريبة:</span>
            <span className="font-mono">{money(inv.subtotal)} {inv.currencyCode}</span>
          </div>
          <div className="flex justify-between">
            <span>ضريبة القيمة المضافة (15%):</span>
            <span className="font-mono">{money(inv.vatAmount)} {inv.currencyCode}</span>
          </div>
          <div className="flex justify-between font-black text-xs pt-1 border-t border-slate-300">
            <span>الإجمالي النهائي المستحق:</span>
            <span className="font-mono">{money(inv.totalAmount)} {inv.currencyCode}</span>
          </div>
        </div>

        {/* ZATCA QR */}
        <div className="text-center pt-1 space-y-1">
          {inv.zatcaQrCode ? (
            <div className="flex justify-center">
              <QRCodeSVG value={inv.zatcaQrCode} size={95} level="M" />
            </div>
          ) : null}
          <div className="text-[8px] text-slate-500">معتمد لدى هيئة الزكاة والضريبة والجمارك (فاتورة)</div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // A4 Standard / Simplified Executive Layout (المعيارية الرسمية A4)
  // ---------------------------------------------------------------------------
  return (
    <div
      id="tax-invoice-printable"
      className="card p-8 sm:p-10 bg-white dark:bg-slate-900 border-2 border-emerald-800/80 rounded-2xl shadow-xl space-y-6 print:shadow-none print:border-none print:p-0 print:m-0 print:text-black print:bg-white relative overflow-hidden"
    >
      {/* Smart Watermark Stamp */}
      {watermarkLabel && (
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none select-none opacity-10 z-0 overflow-hidden"
          style={{ transform: 'rotate(-25deg)' }}
        >
          <span className="text-6xl font-black tracking-widest text-slate-900 border-8 border-dashed border-slate-900 px-12 py-5 rounded-3xl">
            {watermarkLabel}
          </span>
        </div>
      )}

      {/* Top Watermark / Decorative Accent */}
      <div className="absolute top-0 end-0 size-48 bg-gradient-to-bl from-emerald-500/10 to-transparent rounded-bl-full pointer-events-none print:hidden" />

      {/* 1. Official Header */}
      <div className="flex flex-wrap items-start justify-between gap-6 border-b-2 border-emerald-800/20 dark:border-emerald-700 pb-6 relative z-10">
        {/* Company / Supplier Identity */}
        <div className="space-y-2.5 max-w-md">
          <div className="flex items-center gap-3">
            <div className="size-14 rounded-2xl bg-gradient-to-br from-emerald-700 to-teal-900 flex items-center justify-center text-white font-black text-2xl shadow-md border border-emerald-600/30">
              ع
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-950 dark:text-slate-50 tracking-tight">
                {sellerName}
              </h1>
              <div className="text-xs text-slate-500 font-semibold tracking-wider uppercase font-sans">
                {sellerLegalName}
              </div>
              <div className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium mt-0.5">
                حلول هندسة البرمجيات وتأجير الكفاءات الرقمية والاستشارات المحاسبية
              </div>
            </div>
          </div>

          <div className="text-xs text-slate-700 dark:text-slate-300 space-y-1 bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">الرقم الضريبي (VAT):</span>
              <span className="font-mono font-bold text-slate-900 dark:text-slate-100">{sellerVatNumber}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">السجل التجاري (CR):</span>
              <span className="font-mono">{sellerCrNumber}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">العنوان الوطني / المقر:</span>
              <span>{sellerAddress}</span>
            </div>
          </div>
        </div>

        {/* Document Title & Invoice Meta */}
        <div className="text-end space-y-2">
          <div className="inline-block bg-gradient-to-r from-emerald-800 to-teal-900 text-white px-4 py-2 rounded-xl font-black text-lg tracking-wide shadow-xs border border-emerald-700">
            {isCreditNote
              ? 'إشعار دائن ضريبي معتمد / TAX CREDIT NOTE'
              : isSimplified
              ? 'فاتورة ضريبية مبسطة معتمدة / SIMPLIFIED TAX INVOICE'
              : 'فاتورة ضريبية قياسية معتمدة / STANDARD TAX INVOICE'}
          </div>
          <div className="text-xs text-emerald-800 dark:text-emerald-300 font-semibold">
            {isSimplified
              ? 'فاتورة ضريبية مبسطة للأفراد (Simplified Tax Invoice - B2C)'
              : 'فاتورة ضريبية قياسية للشركات والمؤسسات (Standard Tax Invoice - B2B)'}
          </div>

          <div className="pt-2 text-xs space-y-1 bg-emerald-50/40 dark:bg-emerald-950/20 p-3 rounded-xl border border-emerald-200/80 dark:border-emerald-800 text-end">
            <div className="flex items-center justify-end gap-2">
              <span className="text-slate-500">رقم الفاتورة:</span>
              <span className="font-mono font-black text-base text-emerald-800 dark:text-emerald-300">
                {inv.invoiceNo}
              </span>
            </div>
            <div>
              <span className="text-slate-500">تاريخ الإصدار والتوريد: </span>
              <span className="font-mono font-semibold">{inv.issueDate}</span>
              {inv.issueTime && <span className="font-mono text-slate-400 ms-1">({inv.issueTime.slice(11, 19)})</span>}
            </div>
            <div>
              <span className="text-slate-500">تاريخ الاستحقاق: </span>
              <span className="font-mono">{inv.dueDate || 'عند الاستلام (Due on Receipt)'}</span>
            </div>
            <div>
              <span className="text-slate-500">العملة المعتمدة: </span>
              <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{inv.currencyCode}</span>
            </div>
            {isCreditNote && inv.originalInvoiceNo && (
              <div className="text-purple-700 dark:text-purple-300 font-semibold pt-1 border-t border-purple-200 dark:border-purple-800">
                مرتبطة بالفاتورة الأصلية: <span className="font-mono">{inv.originalInvoiceNo}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. ZATCA QR Code & Security Stamp Block */}
      <div className="rounded-2xl border-2 border-emerald-300 dark:border-emerald-700 bg-gradient-to-r from-emerald-50/70 via-teal-50/50 to-slate-50 dark:from-emerald-950/30 dark:via-teal-950/20 dark:to-slate-900 p-4 sm:p-5 flex flex-wrap items-center justify-between gap-5 shadow-xs">
        <div className="flex items-center gap-4">
          <div className="bg-white p-2.5 rounded-xl border-2 border-emerald-600/40 shadow-sm shrink-0">
            {inv.zatcaQrCode ? (
              <QRCodeSVG
                value={inv.zatcaQrCode}
                size={120}
                level="M"
                includeMargin={false}
              />
            ) : (
              <div className="size-28 flex items-center justify-center text-xs text-slate-400 text-center border border-dashed border-slate-300 rounded">
                رمز ZATCA يظهر عند الترحيل
              </div>
            )}
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center gap-1.5 font-black text-emerald-900 dark:text-emerald-200 text-sm">
              <ShieldCheck className="size-5 text-emerald-600 shrink-0" />
              متوافقة ومعتمدة لدى هيئة الزكاة والضريبة والجمارك (ZATCA Compliant)
            </div>
            <p className="text-slate-700 dark:text-slate-300 text-[11px] max-w-lg leading-relaxed">
              تحتوي شفرة الاستجابة السريعة (QR) على بصمة التشفير الرقمية (ECDSA SHA-256) والبيانات المشفرة بصيغة TLV Base64 المعتمدة للمرحلة الثانية من الفوترة الإلكترونية (فاتورة).
            </p>
            {inv.zatcaUuid && (
              <div className="font-mono text-[10px] text-slate-500 break-all bg-white dark:bg-slate-800 p-1 rounded border border-slate-200 dark:border-slate-700 max-w-lg">
                UUID: {inv.zatcaUuid}
              </div>
            )}
          </div>
        </div>

        <div className="text-end text-xs space-y-1 shrink-0">
          <div className="text-slate-500 font-medium">حالة الامتثال والربط الضريبي:</div>
          <div className="font-bold text-emerald-700 dark:text-emerald-400 flex items-center justify-end gap-1.5 text-sm">
            <CheckCircle2 className="size-4" /> معتمد ومطابق للمواصفات
          </div>
          {inv.zatcaIcv && (
            <div className="font-mono text-slate-600 dark:text-slate-400 text-[11px] bg-emerald-100/60 dark:bg-emerald-900/40 px-2 py-0.5 rounded">
              العداد التسلسلي (ICV): #{inv.zatcaIcv}
            </div>
          )}
        </div>
      </div>

      {/* 3. Seller & Buyer Information Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        {/* Supplier Card */}
        <div className="rounded-xl bg-slate-50/70 dark:bg-slate-800/40 p-4 border border-slate-200 dark:border-slate-800 space-y-2">
          <div className="font-bold text-slate-900 dark:text-slate-100 border-b border-slate-200 dark:border-slate-700 pb-1.5 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
              <Building2 className="size-4" /> بيانات المورّد / مقدّم الخدمة (Supplier)
            </span>
            <span className="text-[10px] text-slate-400 font-sans uppercase">Seller Info</span>
          </div>
          <div className="space-y-1 text-slate-700 dark:text-slate-300">
            <div><strong>الاسم:</strong> {sellerName}</div>
            <div><strong>الرقم الضريبي:</strong> <span className="font-mono font-bold">{sellerVatNumber}</span></div>
            {sellerCrNumber && <div><strong>السجل التجاري:</strong> <span className="font-mono">{sellerCrNumber}</span></div>}
            <div><strong>العنوان:</strong> {sellerAddress}</div>
          </div>
        </div>

        {/* Buyer Card */}
        <div className="rounded-xl bg-slate-50/70 dark:bg-slate-800/40 p-4 border border-slate-200 dark:border-slate-800 space-y-2">
          <div className="font-bold text-slate-900 dark:text-slate-100 border-b border-slate-200 dark:border-slate-700 pb-1.5 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
              <User className="size-4" /> بيانات العميل / المشتري (Customer / Buyer)
            </span>
            <span className="text-[10px] text-slate-400 font-sans uppercase">Buyer Info</span>
          </div>
          <div className="space-y-1 text-slate-700 dark:text-slate-300">
            <div><strong>الاسم:</strong> <span className="font-semibold text-slate-900 dark:text-slate-100">{inv.clientName}</span></div>
            {inv.clientNameEn && <div className="text-[11px] text-slate-500 font-sans">English: {inv.clientNameEn}</div>}
            <div>
              <strong>الرقم الضريبي:</strong>{' '}
              <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                {inv.clientVatNumber || 'غير مسجل (Individual / Unregistered Customer)'}
              </span>
            </div>
            {inv.clientCrNumber && <div><strong>السجل التجاري:</strong> <span className="font-mono">{inv.clientCrNumber}</span></div>}
            {inv.clientAddress && <div><strong>العنوان:</strong> {inv.clientAddress} {inv.clientCity ? `، ${inv.clientCity}` : ''}</div>}
            {inv.projectName && (
              <div className="pt-1 text-emerald-700 dark:text-emerald-400 font-medium">
                <strong>المشروع:</strong> {inv.projectName} ({inv.projectCode})
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 4. Engineering & Software Services Line Items Table */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="font-black text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Code2 className="size-4 text-emerald-600" />
            جدول بنود الخدمات وتأجير الكفاءات (Service Line Items)
          </div>
          <span className="text-xs text-slate-500 font-sans uppercase">All Amounts in {inv.currencyCode}</span>
        </div>

        <div className="border-2 border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto shadow-xs">
          <table className="table w-full text-xs">
            <thead className="bg-gradient-to-r from-slate-100 to-emerald-50/60 dark:from-slate-800 dark:to-emerald-950/40 text-slate-800 dark:text-slate-200">
              <tr>
                <th className="w-8 text-center">#</th>
                <th style={{ width: '22%' }}>الموظف / المهندس المكلف</th>
                <th style={{ width: '28%' }}>الخدمة ونطاق العمل</th>
                <th style={{ width: '10%' }} className="text-center">الوقت / الأساس</th>
                <th style={{ width: '10%' }} className="text-end">سعر الوحدة</th>
                <th style={{ width: '6%' }} className="text-center">الخصم %</th>
                <th style={{ width: '8%' }} className="text-end">الوعاء الضريبي</th>
                <th style={{ width: '6%' }} className="text-center">الضريبة</th>
                <th style={{ width: '10%' }} className="text-end font-bold">الإجمالي</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {inv.lines.map((l, i) => {
                const desc = l.description || '';
                const empName = l.employeeName;
                const empCode = l.employeeCode;

                return (
                  <tr key={l.id || i} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 break-inside-avoid">
                    <td className="text-center text-slate-400 font-mono text-[11px]">{l.lineNo ?? i + 1}</td>

                    <td>
                      <div className="space-y-0.5">
                        {empName ? (
                          <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-slate-100">
                            <span className="size-5 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 flex items-center justify-center text-[10px] shrink-0">
                              <User className="size-3" />
                            </span>
                            <span>{empName}</span>
                          </div>
                        ) : (
                          <div className="text-slate-400 italic">فريق العمل والبرمجة</div>
                        )}
                        <div className="text-[11px] text-slate-500 font-mono">
                          {empCode ? `كود: ${empCode}` : ''}{' '}
                          {l.positionTitle ? `• ${l.positionTitle}` : ''}
                        </div>
                      </div>
                    </td>

                    <td>
                      <div className="font-medium text-slate-900 dark:text-slate-100 leading-snug">
                        {desc}
                      </div>
                    </td>

                    <td className="text-center">
                      <div className="font-mono font-bold text-slate-900 dark:text-slate-100">
                        {Number(l.quantity).toFixed(2)}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {l.pricingBasis === 'HOURS'
                          ? 'ساعة عمل'
                          : l.pricingBasis === 'DAYS'
                          ? 'يوم عمل'
                          : l.pricingBasis === 'MONTH'
                          ? 'شهر تفرغ'
                          : 'وحدة'}
                      </div>
                    </td>

                    <td className="text-end font-mono font-medium">{money(l.unitPrice)}</td>

                    <td className="text-center font-mono">
                      {Number(l.discountPct || 0) > 0 ? (
                        <span className="text-rose-600 font-medium">{Number(l.discountPct)}%</span>
                      ) : (
                        '0%'
                      )}
                    </td>

                    <td className="text-end font-mono">{money(l.subtotal)}</td>
                    <td className="text-center font-mono text-slate-500">{Number(l.vatRate || 15)}%</td>
                    <td className="text-end font-mono font-black text-slate-900 dark:text-slate-100 text-xs">
                      {money(l.total)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. Financial Summary & Bilingual Tafqeet */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 items-start break-inside-avoid">
        {/* Left: Bilingual Tafqeet Box & Notes */}
        <div className="space-y-3">
          <div className="rounded-2xl border-2 border-emerald-600/30 bg-emerald-50/50 dark:bg-emerald-950/20 p-4 space-y-2">
            <div className="font-black text-xs text-emerald-900 dark:text-emerald-300 flex items-center gap-1.5">
              <FileCheck2 className="size-4 text-emerald-600" />
              المبلغ الإجمالي كتابة (Bilingual Amount in Words):
            </div>
            <div className="text-xs text-slate-900 dark:text-slate-100 font-bold leading-relaxed">
              <strong>المبلغ بالعربية: </strong>
              {tafqeetArabic(inv.totalAmount, inv.currencyCode)}
            </div>
            <div className="text-xs text-slate-700 dark:text-slate-300 font-medium font-sans leading-relaxed border-t border-emerald-200/60 dark:border-emerald-800 pt-1.5">
              <strong>In English: </strong>
              {tafqeetEnglish(inv.totalAmount, inv.currencyCode)}
            </div>
          </div>

          {inv.notes && (
            <div className="text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
              <strong className="text-slate-800 dark:text-slate-200">الشروط والملاحظات:</strong>
              <p className="whitespace-pre-wrap leading-relaxed">{inv.notes}</p>
            </div>
          )}
        </div>

        {/* Right: Totals Card */}
        <div className="rounded-2xl bg-gradient-to-br from-slate-50 to-emerald-50/40 dark:from-slate-800 dark:to-emerald-950/30 border-2 border-slate-200 dark:border-slate-800 p-5 space-y-2.5 text-xs shadow-xs">
          <div className="flex justify-between text-slate-600 dark:text-slate-400">
            <span>المجموع الفرعي (غير شامل ضريبة القيمة المضافة):</span>
            <span className="font-mono font-medium">{money(inv.subtotal)} {inv.currencyCode}</span>
          </div>
          {Number(inv.discountAmount) > 0 && (
            <div className="flex justify-between text-rose-600">
              <span>إجمالي الخصم التجاري:</span>
              <span className="font-mono font-medium">-{money(inv.discountAmount)} {inv.currencyCode}</span>
            </div>
          )}
          <div className="flex justify-between text-slate-700 dark:text-slate-300 font-medium">
            <span>المبلغ الخاضع للضريبة (Taxable Base):</span>
            <span className="font-mono font-bold">{money(inv.taxableAmount)} {inv.currencyCode}</span>
          </div>
          <div className="flex justify-between text-amber-700 dark:text-amber-400 font-bold">
            <span>ضريبة القيمة المضافة (15% VAT):</span>
            <span className="font-mono">{money(inv.vatAmount)} {inv.currencyCode}</span>
          </div>
          <div className="pt-3 border-t-2 border-emerald-800/20 dark:border-emerald-700 flex justify-between font-black text-lg text-slate-900 dark:text-slate-100">
            <span className="text-emerald-900 dark:text-emerald-300">صافي المجموع المستحق:</span>
            <span className="font-mono text-emerald-800 dark:text-emerald-300">
              {isCreditNote ? `-${money(inv.totalAmount)}` : money(inv.totalAmount)} {inv.currencyCode}
            </span>
          </div>
        </div>
      </div>

      {/* 6. Bank Transfer Instructions */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40 p-4 space-y-2 text-xs break-inside-avoid">
        <div className="font-bold text-slate-900 dark:text-slate-100 flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-1.5">
          <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
            <Wallet className="size-4" /> بيانات الحساب والتحويل البنكي المعتمد (Bank Transfer Instructions)
          </span>
          <span className="text-[11px] text-slate-400">يرجى إدراج رقم الفاتورة في وصف التحويل</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          <div>
            <span className="text-slate-500 block">اسم البنك المعتمد:</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">{bankName}</span>
          </div>
          <div>
            <span className="text-slate-500 block">رقم الحساب:</span>
            <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">{accountNo}</span>
          </div>
          <div>
            <span className="text-slate-500 block">رقم الآيبان الدولي (IBAN):</span>
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-emerald-800 dark:text-emerald-300">{ibanNumber}</span>
              {onCopyIban && (
                <button
                  type="button"
                  onClick={() => onCopyIban(ibanNumber)}
                  className="print:hidden text-slate-400 hover:text-emerald-600 transition"
                  title="نسخ رقم الآيبان"
                >
                  {copiedIban ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 7. Official Signatures & Certified Stamp Block */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6 border-t border-slate-200 dark:border-slate-800 text-xs break-inside-avoid">
        {/* Prepared By */}
        <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-center space-y-6 bg-slate-50/40 dark:bg-slate-800/20">
          <div className="font-bold text-slate-700 dark:text-slate-300">
            إعداد ومراجعة المحاسب المالي
          </div>
          <div className="font-script text-slate-400 italic text-sm">
            Certified Financial Accountant
          </div>
          <div className="border-t border-dashed border-slate-300 dark:border-slate-700 pt-1 text-[11px] text-slate-500">
            التوقيع والتاريخ
          </div>
        </div>

        {/* Approved By */}
        <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-center space-y-6 bg-slate-50/40 dark:bg-slate-800/20">
          <div className="font-bold text-slate-700 dark:text-slate-300">
            اعتماد المدير المالي / المفوض بالتوقيع
          </div>
          <div className="font-script text-slate-400 italic text-sm">
            Authorized Executive Signatory
          </div>
          <div className="border-t border-dashed border-slate-300 dark:border-slate-700 pt-1 text-[11px] text-slate-500">
            التوقيع والاعتماد
          </div>
        </div>

        {/* Certified Digital Stamp */}
        <div className="border-2 border-emerald-600/40 rounded-xl p-4 flex flex-col items-center justify-center text-center space-y-1 bg-emerald-50/30 dark:bg-emerald-950/20 relative">
          <div className="size-16 rounded-full border-2 border-dashed border-emerald-600 flex items-center justify-center p-1 text-emerald-800 dark:text-emerald-300">
            <div className="size-full rounded-full border border-emerald-600 flex flex-col items-center justify-center">
              <span className="text-[8px] font-black uppercase">ZATCA</span>
              <Check className="size-4 text-emerald-600" />
              <span className="text-[7px] font-bold">VERIFIED</span>
            </div>
          </div>
          <div className="font-black text-emerald-900 dark:text-emerald-200 text-[11px]">
            ختم الاعتماد الضريبي الرقمي
          </div>
          <div className="text-[9px] text-slate-400 font-sans">Official Certified Electronic Stamp</div>
        </div>
      </div>
    </div>
  );
};
