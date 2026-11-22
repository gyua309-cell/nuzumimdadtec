import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle, ArrowRight, BarChart3, Building2, CheckCircle2, FileText,
  Filter, Pencil, PieChart, Plus, Printer, RotateCcw, Save, Search, Send, ShieldCheck,
  ShoppingCart, Sparkles, Trash2, Truck, Upload, Wallet,
} from 'lucide-react';
import { api, Page } from '../lib/api';
import { money, tafqeetArabic, tafqeetEnglish, today } from '../lib/format';
import { CsvImportModal, FieldDef } from '../components/CrudPage';
import { ExecutiveBarChart, ExecutiveChartCard, ExecutiveDonutChart } from '../components/ExecutiveCharts';
import { ExportMenu } from '../components/ExportMenu';
import { ExportEngine } from '../engine/export-engine';
import { PeriodSelect } from '../components/forms';
import { SearchableSelect } from '../components/SearchableSelect';
import { TreasuryPaymentModal } from '../components/TreasuryPaymentModal';
import { JournalLinkBadge } from '../components/JournalPreviewPill';
import {
  ActionButton, ActionGroup, AddButton, Badge, Drawer, EmptyState, ErrorState, Field, FormSection, Loading, Modal, PageHeader,
  ReasonDialog, Stat, useToast,
} from '../components/ui';

// ============================================================================
// Vendors Page
// ============================================================================
const vendorImportFields: FieldDef[] = [
  { name: 'code', label: 'كود المورد', type: 'text', required: true, ltr: true },
  { name: 'nameAr', label: 'اسم المورد بالعربية', type: 'text', required: true },
  { name: 'nameEn', label: 'الاسم بالإنجليزية', type: 'text', ltr: true },
  { name: 'taxRegistrationNo', label: 'الرقم الضريبي', type: 'text', ltr: true },
  { name: 'crNumber', label: 'السجل التجاري', type: 'text', ltr: true },
  { name: 'contactPerson', label: 'مسؤول الاتصال', type: 'text' },
  { name: 'phone', label: 'الهاتف', type: 'text', ltr: true },
  { name: 'email', label: 'البريد الإلكتروني', type: 'text', ltr: true },
  { name: 'paymentTermsDays', label: 'شروط السداد (أيام)', type: 'number', default: 30 },
  { name: 'isActive', label: 'الحالة', type: 'bool', default: true },
];

export function VendorsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [importingOpen, setImportingOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<any | null>(null);
  const [viewingVendor, setViewingVendor] = useState<any | null>(null);

  const vendors = useQuery({
    queryKey: ['/vendors', q],
    queryFn: () => api.get<Page<any>>('/vendors', { q, pageSize: 100 }),
  });

  const list = Array.isArray(vendors.data) ? vendors.data : (vendors.data?.data ?? []);
  const activeCount = list.filter((v) => v.isActive).length;
  const vatCount = list.filter((v) => v.taxRegistrationNo).length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="دليل الموردين والجهات الخارجية"
        subtitle="إدارة الموردين، شركات التراخيص السحابية، الاستشارات الخارجية ومقاولي الباطن للمشاريع مع أرقامهم الضريبية والسجلات التجارية."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ExportMenu
              title="دليل الموردين والجهات الخارجية"
              filename={`vendors-${today()}`}
              columns={[
                { key: 'code', header: 'كود المورد', width: 14 },
                { key: 'nameAr', header: 'اسم المورد بالعربية', width: 25 },
                { key: 'nameEn', header: 'الاسم بالإنجليزية', width: 20 },
                { key: 'taxRegistrationNo', header: 'الرقم الضريبي', width: 18 },
                { key: 'crNumber', header: 'السجل التجاري', width: 16 },
                { key: 'contactPerson', header: 'مسؤول الاتصال', width: 20 },
                { key: 'phone', header: 'الهاتف', width: 16 },
                { key: 'email', header: 'البريد الإلكتروني', width: 22 },
                { key: 'paymentTermsDays', header: 'شروط السداد (أيام)', width: 14, type: 'number' },
                { key: 'isActiveLabel', header: 'الحالة', width: 12 },
              ]}
              data={list.map((v: any) => ({ ...v, isActiveLabel: v.isActive ? 'نشط' : 'معطل' }))}
            />
            <button
              type="button"
              className="btn-secondary text-xs flex items-center gap-1.5"
              onClick={() => setImportingOpen(true)}
              title="استيراد موردين من ملف Excel (.xlsx) أو CSV"
            >
              <Upload className="size-3.5 text-cyan-600 dark:text-cyan-400" /> استيراد Excel / CSV
            </button>
            <AddButton
              label="إضافة مورد جديد"
              onClick={() => setShowAddModal(true)}
            />
          </div>
        }
      />

      {/* KPI Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <Stat label="إجمالي الموردين" value={String(list.length)} tone="blue" icon={Truck} hint="المسجلون في النظام" />
        <Stat label="موردون نشطون" value={String(activeCount)} tone="green" icon={CheckCircle2} hint="متاحون لإصدار الفواتير" />
        <Stat label="مسجلون بهيئة الزكاة" value={String(vatCount)} tone="cyan" icon={ShieldCheck} hint="برقم ضريبي معتمد 15 رقم" />
        <Stat label="فئات التوريد" value="سيرفرات وتراخيص واستشارات" tone="purple" icon={Building2} hint="تقنية وبرمجية" />
      </div>

      {/* Filter & Search Bar */}
      <div className="card p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-80">
          <Search className="absolute start-3 top-2.5 size-4 text-slate-400" />
          <input
            className="input ps-9 h-9 text-xs w-full"
            placeholder="بحث بالكود، اسم المورد، أو الرقم الضريبي…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="text-xs text-slate-500 font-mono">
          إجمالي الموردين: <strong className="text-slate-900 dark:text-slate-100">{list.length}</strong>
        </div>
      </div>

      {/* Vendors Table */}
      <div className="card overflow-hidden">
        {vendors.isLoading ? (
          <Loading />
        ) : vendors.isError ? (
          <ErrorState error={vendors.error} />
        ) : list.length === 0 ? (
          <EmptyState
            text="لا يوجد موردون مسجلون حتى الآن."
            action={
              <button className="btn-primary text-xs" onClick={() => setShowAddModal(true)}>
                إضافة أول مورد الآن
              </button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table w-full text-xs">
              <thead>
                <tr>
                  <th>كود المورد</th>
                  <th>اسم المورد</th>
                  <th>الرقم الضريبي (15 رقم)</th>
                  <th>السجل التجاري</th>
                  <th>مسؤول الاتصال</th>
                  <th>الهاتف / البريد</th>
                  <th>شروط السداد</th>
                  <th>الحالة</th>
                  <th className="text-end">الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {list.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                    <td className="font-mono font-bold text-brand-600">{v.code}</td>
                    <td>
                      <div className="font-bold text-slate-900 dark:text-slate-100">{v.nameAr}</div>
                      {v.nameEn && <div className="text-[11px] font-mono text-slate-400">{v.nameEn}</div>}
                    </td>
                    <td className="font-mono text-slate-700 dark:text-slate-300">
                      {v.taxRegistrationNo ? (
                        <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-[11px] font-semibold">
                          {v.taxRegistrationNo}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="font-mono text-slate-600 dark:text-slate-400">{v.crNumber || '—'}</td>
                    <td>{v.contactPerson || '—'}</td>
                    <td>
                      <div className="text-slate-700 dark:text-slate-300">{v.phone || '—'}</div>
                      {v.email && <div className="text-[10px] text-slate-400 font-mono">{v.email}</div>}
                    </td>
                    <td>
                      <span className="font-medium text-slate-700 dark:text-slate-300">
                        {v.paymentTermsDays} يوم
                      </span>
                    </td>
                    <td>
                      <Badge color={v.isActive ? 'green' : 'slate'}>
                        {v.isActive ? 'نشط' : 'معطل'}
                      </Badge>
                    </td>
                    <td onClick={(evt) => evt.stopPropagation()}>
                      <ActionGroup>
                        <ActionButton
                          variant="view"
                          title="معاينة المورد"
                          onClick={() => setViewingVendor(v)}
                        />
                        <ActionButton
                          variant="edit"
                          title="تعديل المورد"
                          onClick={() => {
                            setEditingVendor(v);
                            setShowAddModal(true);
                          }}
                        />
                        <ActionButton
                          variant="print"
                          title="طباعة بطاقة المورد (ملكي A4)"
                          onClick={() =>
                            void ExportEngine.exportDetailPdf({
                              title: `بطاقة بيانات مورد معتمد: ${v.nameAr}`,
                              subtitle: `كود المورد: ${v.code || '—'}`,
                              filename: `vendor-${v.code || v.id}-${today()}`,
                              docNo: v.code || v.id?.slice(0, 8),
                              docDate: today(),
                              statusLabel: v.isActive ? 'مورد نشط' : 'مورد معطل',
                              statusTone: v.isActive ? 'green' : 'slate',
                              metaFields: [
                                { label: 'كود المورد', value: v.code },
                                { label: 'اسم المورد (عربي)', value: v.nameAr },
                                { label: 'اسم المورد (إنجليزي)', value: v.nameEn || '—' },
                                { label: 'الرقم الضريبي (VAT)', value: v.taxRegistrationNo || '—' },
                                { label: 'السجل التجاري', value: v.commercialRegNo || '—' },
                                { label: 'شروط السداد', value: `${v.paymentTermsDays ?? 30} يوم` },
                                { label: 'البريد الإلكتروني', value: v.email || '—' },
                                { label: 'الهاتف / الجوال', value: v.phone || '—' },
                                { label: 'العنوان', value: v.address || '—' },
                              ],
                              signatureLabels: ['إدارة المشتريات', 'المحاسبة والموردين', 'الاعتماد'],
                            })
                          }
                        />
                        <ActionButton
                          variant="delete"
                          title="حذف المورد"
                          onClick={() => {
                            if (confirm(`هل أنت متأكد من حذف المورد ${v.nameAr}؟`)) {
                              api.del(`/vendors/${v.id}`)
                                .then(() => {
                                  toast.success('تم حذف المورد بنجاح');
                                  qc.invalidateQueries({ queryKey: ['/vendors'] });
                                })
                                .catch((err) => toast.error(err));
                            }
                          }}
                        />
                      </ActionGroup>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CreateVendorModal
        open={showAddModal}
        vendor={editingVendor}
        onClose={() => {
          setShowAddModal(false);
          setEditingVendor(null);
        }}
        onSuccess={() => {
          qc.invalidateQueries({ queryKey: ['/vendors'] });
          setShowAddModal(false);
          setEditingVendor(null);
        }}
      />

      <Drawer
        open={!!viewingVendor}
        onClose={() => setViewingVendor(null)}
        title={`معاينة المورد: ${viewingVendor?.nameAr || ''}`}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setViewingVendor(null)}>إغلاق</button>
            <button
              className="btn-primary flex items-center gap-1.5"
              onClick={() => {
                const cur = viewingVendor;
                setViewingVendor(null);
                setEditingVendor(cur);
                setShowAddModal(true);
              }}
            >
              <Pencil className="size-3.5" /> تعديل بيانات المورد
            </button>
          </>
        }
      >
        <div className="space-y-4 text-xs">
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800">
            <h4 className="text-xs font-extrabold text-slate-900 dark:text-slate-100 uppercase tracking-wider mb-3">بيانات المورد الرسمية</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="flex flex-col border-b border-slate-200/60 dark:border-slate-800/60 pb-2">
                <span className="text-slate-500 dark:text-slate-400 font-medium">كود المورد</span>
                <span className="font-mono font-bold text-slate-900 dark:text-slate-100 mt-1">{viewingVendor?.code}</span>
              </div>
              <div className="flex flex-col border-b border-slate-200/60 dark:border-slate-800/60 pb-2">
                <span className="text-slate-500 dark:text-slate-400 font-medium">الاسم بالعربية</span>
                <span className="font-bold text-slate-900 dark:text-slate-100 mt-1">{viewingVendor?.nameAr}</span>
              </div>
              <div className="flex flex-col border-b border-slate-200/60 dark:border-slate-800/60 pb-2">
                <span className="text-slate-500 dark:text-slate-400 font-medium">الاسم بالإنجليزية</span>
                <span className="font-mono text-slate-700 dark:text-slate-300 mt-1">{viewingVendor?.nameEn || '—'}</span>
              </div>
              <div className="flex flex-col border-b border-slate-200/60 dark:border-slate-800/60 pb-2">
                <span className="text-slate-500 dark:text-slate-400 font-medium">الرقم الضريبي</span>
                <span className="font-mono font-bold text-slate-900 dark:text-slate-100 mt-1">{viewingVendor?.taxRegistrationNo || '—'}</span>
              </div>
              <div className="flex flex-col border-b border-slate-200/60 dark:border-slate-800/60 pb-2">
                <span className="text-slate-500 dark:text-slate-400 font-medium">السجل التجاري</span>
                <span className="font-mono text-slate-700 dark:text-slate-300 mt-1">{viewingVendor?.crNumber || '—'}</span>
              </div>
              <div className="flex flex-col border-b border-slate-200/60 dark:border-slate-800/60 pb-2">
                <span className="text-slate-500 dark:text-slate-400 font-medium">مسؤول الاتصال</span>
                <span className="text-slate-900 dark:text-slate-100 mt-1">{viewingVendor?.contactPerson || '—'}</span>
              </div>
              <div className="flex flex-col border-b border-slate-200/60 dark:border-slate-800/60 pb-2">
                <span className="text-slate-500 dark:text-slate-400 font-medium">الهاتف</span>
                <span className="font-mono text-slate-900 dark:text-slate-100 mt-1">{viewingVendor?.phone || '—'}</span>
              </div>
              <div className="flex flex-col border-b border-slate-200/60 dark:border-slate-800/60 pb-2">
                <span className="text-slate-500 dark:text-slate-400 font-medium">شروط السداد</span>
                <span className="font-medium text-slate-900 dark:text-slate-100 mt-1">{viewingVendor?.paymentTermsDays} يوم</span>
              </div>
            </div>
          </div>
        </div>
      </Drawer>

      <CsvImportModal
        open={importingOpen}
        onClose={() => setImportingOpen(false)}
        title="دليل الموردين"
        fields={vendorImportFields}
        path="/vendors"
        onSuccess={() => {
          qc.invalidateQueries({ queryKey: ['/vendors'] });
          qc.invalidateQueries({ queryKey: ['ref'] });
        }}
      />
    </div>
  );
}

function CreateVendorModal({ open, vendor, onClose, onSuccess }: { open: boolean; vendor?: any; onClose: () => void; onSuccess: () => void }) {
  const toast = useToast();
  const [code, setCode] = useState(`VEN-${Math.floor(1000 + Math.random() * 9000)}`);
  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [taxRegistrationNo, setTaxRegistrationNo] = useState('');
  const [crNumber, setCrNumber] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [paymentTermsDays, setPaymentTermsDays] = useState(30);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (vendor) {
      setCode(vendor.code || '');
      setNameAr(vendor.nameAr || '');
      setNameEn(vendor.nameEn || '');
      setTaxRegistrationNo(vendor.taxRegistrationNo || '');
      setCrNumber(vendor.crNumber || '');
      setContactPerson(vendor.contactPerson || '');
      setPhone(vendor.phone || '');
      setEmail(vendor.email || '');
      setPaymentTermsDays(vendor.paymentTermsDays || 30);
    } else {
      setCode(`VEN-${Math.floor(1000 + Math.random() * 9000)}`);
      setNameAr('');
      setNameEn('');
      setTaxRegistrationNo('');
      setCrNumber('');
      setContactPerson('');
      setPhone('');
      setEmail('');
      setPaymentTermsDays(30);
    }
  }, [vendor, open]);

  const handleSubmit = async () => {
    if (!nameAr.trim()) {
      toast.error(new Error('يرجى إدخال اسم المورد بالعربية'));
      return;
    }
    if (taxRegistrationNo && taxRegistrationNo.trim().length !== 15) {
      toast.error(new Error('الرقم الضريبي للمورد يجب أن يتكون من 15 رقماً بالضبط'));
      return;
    }
    setBusy(true);
    try {
      const payload = {
        code,
        nameAr,
        nameEn: nameEn || undefined,
        taxRegistrationNo: taxRegistrationNo || undefined,
        crNumber: crNumber || undefined,
        contactPerson: contactPerson || undefined,
        phone: phone || undefined,
        email: email || undefined,
        paymentTermsDays: Number(paymentTermsDays) || 30,
        currencyCode: 'SAR',
        isActive: true,
      };

      if (vendor && vendor.id) {
        await api.patch(`/vendors/${vendor.id}`, payload);
        toast.success('تم تحديث بيانات المورد بنجاح');
      } else {
        await api.post('/vendors', payload);
        toast.success('تمت إضافة المورد بنجاح');
      }
      onSuccess();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      size="lg"
      dirty={Boolean(nameAr || nameEn || taxRegistrationNo || crNumber || contactPerson || phone || email)}
      saving={busy}
      onSaveShortcut={handleSubmit}
      title={vendor?.id ? `تعديل بيانات المورد: ${vendor.nameAr || ''}` : 'إضافة مورد جديد'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" disabled={busy} onClick={onClose}>إلغاء</button>
          <button type="button" className="btn-primary flex items-center gap-1.5" disabled={busy} onClick={handleSubmit}>
            <Save className="size-3.5" />
            {busy ? 'جاري الحفظ...' : 'حفظ المورد'}
          </button>
        </>
      }
    >
      <div className="space-y-4 text-xs">
        <FormSection title="التعريف والتسجيل الضريبي والتجاري" icon={<Building2 className="size-4" />} columns={3}>
          <Field label="كود المورد" required>
            <input className="input font-mono font-bold" dir="ltr" value={code} onChange={(e) => setCode(e.target.value)} />
          </Field>
          <Field label="اسم المورد بالعربية" required>
            <input className="input" autoFocus placeholder="مثال: شركة أمازون ويب سيرفيسز AWS" value={nameAr} onChange={(e) => setNameAr(e.target.value)} />
          </Field>
          <Field label="اسم المورد بالإنجليزية">
            <input className="input font-sans" dir="ltr" placeholder="e.g. Amazon Web Services MENA" value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
          </Field>
          <Field label="الرقم الضريبي للمورد (15 رقم)">
            <input className="input font-mono" dir="ltr" placeholder="300000000000003" maxLength={15} value={taxRegistrationNo} onChange={(e) => setTaxRegistrationNo(e.target.value)} />
          </Field>
          <Field label="رقم السجل التجاري">
            <input className="input font-mono" dir="ltr" placeholder="1010000000" value={crNumber} onChange={(e) => setCrNumber(e.target.value)} />
          </Field>
          <Field label="شروط السداد (أيام)">
            <input type="number" className="input font-mono" dir="ltr" value={paymentTermsDays} onChange={(e) => setPaymentTermsDays(parseInt(e.target.value) || 0)} />
          </Field>
        </FormSection>

        <FormSection title="بيانات التواصل" icon={<Truck className="size-4" />} columns={3}>
          <Field label="مسؤول الاتصال">
            <input className="input" placeholder="اسم المسؤول" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} />
          </Field>
          <Field label="الهاتف">
            <input className="input font-mono" dir="ltr" type="tel" placeholder="0500000000" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field label="البريد الإلكتروني">
            <input className="input font-mono" dir="ltr" type="email" placeholder="billing@vendor.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
        </FormSection>
      </div>
    </Modal>
  );
}

// ============================================================================
// Purchase Invoices & Expenses Page
// ============================================================================
export function PurchaseInvoicesPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();

  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [cancelTargetId, setCancelTargetId] = useState<string | null>(null);

  const invoices = useQuery({
    queryKey: ['/purchase-invoices', typeFilter, statusFilter],
    queryFn: () => api.get<Page<any>>('/purchase-invoices', { type: typeFilter || undefined, status: statusFilter || undefined, pageSize: 100 }),
  });

  const list = Array.isArray(invoices.data) ? invoices.data : (invoices.data?.data ?? []);
  const postedCount = list.filter((i) => i.status === 'POSTED').length;
  const draftCount = list.filter((i) => i.status === 'DRAFT').length;
  const totalAmountSum = list.reduce((acc, i) => acc + (parseFloat(i.totalAmount) || 0), 0);
  const totalVatSum = list.reduce((acc, i) => acc + (parseFloat(i.vatAmount) || 0), 0);

  const doPost = async (id: string) => {
    if (!confirm('ترحيل فاتورة المشتريات وتوليد القيد المحاسبي المزدوج آلياً في دفتر الأستاذ العام؟')) return;
    try {
      await api.post(`/purchase-invoices/${id}/post`);
      toast.success('تم ترحيل الفاتورة وتوليد القيد المحاسبي آلياً بنجاح');
      qc.invalidateQueries({ queryKey: ['/purchase-invoices'] });
    } catch (e) {
      toast.error(e);
    }
  };

  const vendorSpendChart = useMemo(() => {
    const map = new Map<string, { net: number; vat: number }>();
    for (const inv of list) {
      if (inv.status === 'CANCELLED') continue;
      const label = inv.vendorName || inv.invoiceNo || 'مورد';
      const prev = map.get(label) || { net: 0, vat: 0 };
      prev.net += Number(inv.subtotal ?? 0);
      prev.vat += Number(inv.vatAmount ?? 0);
      map.set(label, prev);
    }
    const entries = Array.from(map.entries()).slice(0, 8);
    return {
      categories: entries.map(([k]) => k),
      net: entries.map(([, v]) => Number(v.net.toFixed(2))),
      vat: entries.map(([, v]) => Number(v.vat.toFixed(2))),
    };
  }, [list]);

  const purTypeDonut = useMemo(() => {
    const std = list.filter((x: any) => x.invoiceType === 'STANDARD_BILL' || !x.invoiceType).length;
    const exp = list.filter((x: any) => x.invoiceType === 'EXPENSE_BILL').length;
    const deb = list.filter((x: any) => x.invoiceType === 'DEBIT_NOTE').length;
    return [
      { name: 'مشتريات قياسية', value: std, color: '#4f46e5' },
      { name: 'مصروفات تشغيلية وسحابية', value: exp, color: '#f59e0b' },
      { name: 'إشعارات مدينة', value: deb, color: '#8b5cf6' },
    ];
  }, [list]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="فواتير المشتريات ومصروفات المشاريع (مع التوليد الآلي للقيود)"
        subtitle="تسجيل فواتير الموردين ومصروفات السيرفرات والتراخيص واستشارات المشاريع. الترحيل يولّد القيد المحاسبي المزدوج آلياً في دفاتر اليومية."
        icon={ShoppingCart}
        badge={
          <Badge color="amber" dot>
            {list.length} فاتورة ومصروف
          </Badge>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ExportMenu
              title="فواتير المشتريات ومصروفات المشاريع"
              filename={`purchase-invoices-${today()}`}
              columns={[
                { key: 'invoiceNo', header: 'رقم الفاتورة الداخلي', width: 16 },
                { key: 'vendorInvoiceNo', header: 'رقم فاتورة المورد', width: 16 },
                { key: 'invoiceType', header: 'نوع الفاتورة', width: 16 },
                { key: 'vendorName', header: 'المورد', width: 24 },
                { key: 'vendorTaxNo', header: 'الرقم الضريبي للمورد', width: 18 },
                { key: 'projectName', header: 'المشروع', width: 20 },
                { key: 'issueDate', header: 'تاريخ الإصدار', width: 14, type: 'date' },
                { key: 'subtotal', header: 'المبلغ قبل الضريبة', width: 16, type: 'currency', isTotal: true },
                { key: 'vatAmount', header: 'ضريبة المدخلات 15%', width: 16, type: 'currency', isTotal: true },
                { key: 'totalAmount', header: 'الإجمالي شامل الضريبة', width: 18, type: 'currency', isTotal: true },
                { key: 'journalEntryNo', header: 'رقم القيد المحاسبي', width: 16 },
                { key: 'status', header: 'الحالة', width: 14 },
              ]}
              data={list}
            />
            <button
              className="btn-primary text-xs flex items-center gap-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 shadow-sm"
              onClick={() => setShowCreateModal(true)}
            >
              <Plus className="size-4" /> تسجيل فاتورة مشتريات / مصروف
            </button>
          </div>
        }
      />

      {/* KPI Stats Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <Stat label="إجمالي فواتير المشتريات" value={String(list.length)} tone="indigo" icon={ShoppingCart} hint="فواتير الموردين والمصروفات" />
        <Stat label="فواتير مقيدة بالدفاتر" value={String(postedCount)} tone="green" icon={CheckCircle2} progress={list.length > 0 ? Math.round((postedCount / list.length) * 100) : 0} hint="مرحلة بقيود محاسبية آلية" />
        <Stat label="مسودات قيد المراجعة" value={String(draftCount)} tone="amber" icon={AlertCircle} hint="بانتظار الاعتماد والترحيل" />
        <Stat label="إجمالي المشتريات (مع الضريبة)" value={money(totalAmountSum)} tone="red" icon={Wallet} hint={`ضريبة مدخلات 15%: ${money(totalVatSum)}`} />
      </div>

      {/* Purchases Interactive Analytics Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ExecutiveChartCard
          title="توزيع المشتريات والمصروفات حسب الموردين"
          subtitle="صافي تكلفة المشتريات مقابل ضريبة المدخلات المستردة 15%"
          icon={BarChart3}
          accent="amber"
          className="lg:col-span-2"
        >
          <ExecutiveBarChart
            categories={vendorSpendChart.categories}
            series={[
              { name: 'صافي المشتريات', data: vendorSpendChart.net, stack: 'pur', color: '#f59e0b', colorEnd: '#d97706' },
              { name: 'ضريبة المدخلات 15%', data: vendorSpendChart.vat, stack: 'pur', color: '#0ea5e9', colorEnd: '#0284c7' },
            ]}
            height={220}
            unit="SAR"
            emptyText="لا توجد فواتير مشتريات مسجلة بعد"
          />
        </ExecutiveChartCard>

        <ExecutiveChartCard
          title="توزيع أنواع المشتريات والمصروفات"
          subtitle="تصنيف فواتير الموردين والخدمات السحابية"
          icon={PieChart}
          accent="purple"
        >
          <ExecutiveDonutChart
            data={purTypeDonut}
            centerValue={String(list.length)}
            centerLabel="إجمالي الفواتير"
            height={220}
            unit="فاتورة"
            emptyText="لا توجد مشتريات"
          />
        </ExecutiveChartCard>
      </div>

      {/* Filters Bar */}
      <div className="card p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
            <Filter className="size-4 text-slate-400" /> تصفية:
          </div>
          <select className="input h-8 text-xs py-1 px-2.5 w-44" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">جميع الأنواع</option>
            <option value="STANDARD_BILL">فاتورة مشتريات قياسية</option>
            <option value="EXPENSE_BILL">مصروف تشغيلي / سحابي</option>
            <option value="DEBIT_NOTE">إشعار مدين (مردودات)</option>
          </select>
          <select className="input h-8 text-xs py-1 px-2.5 w-36" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">جميع الحالات</option>
            <option value="DRAFT">مسودة</option>
            <option value="POSTED">مرحّلة ومعتمدة</option>
            <option value="CANCELLED">ملغاة</option>
          </select>
        </div>
        <div className="text-xs text-slate-500 font-mono">
          إجمالي ضريبة المدخلات المستردة (15%): <strong className="text-emerald-700 dark:text-emerald-400">{money(totalVatSum)}</strong>
        </div>
      </div>

      {/* Invoices Table */}
      <div className="card overflow-hidden">
        {invoices.isLoading ? (
          <Loading />
        ) : invoices.isError ? (
          <ErrorState error={invoices.error} />
        ) : list.length === 0 ? (
          <EmptyState
            text="لا توجد فواتير مشتريات مسجلة حتى الآن."
            action={
              <button className="btn-primary text-xs" onClick={() => setShowCreateModal(true)}>
                تسجيل أول فاتورة مشتريات
              </button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table w-full text-xs">
              <thead>
                <tr>
                  <th>رقم الفاتورة</th>
                  <th>فاتورة المورد</th>
                  <th>المورد</th>
                  <th>المشروع المرتبط</th>
                  <th>تاريخ الإصدار</th>
                  <th>قبل الضريبة</th>
                  <th>ضريبة 15%</th>
                  <th>الإجمالي شامل الضريبة</th>
                  <th>القيد المحاسبي المتولد آلياً</th>
                  <th>الحالة</th>
                  <th className="text-end">الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {list.map((inv) => {
                  const isDebit = inv.invoiceType === 'DEBIT_NOTE';
                  return (
                    <tr key={inv.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                      <td className="font-mono font-bold">
                        <Link to={`/pur/invoices/${inv.id}`} className="text-brand-600 hover:underline">
                          {inv.invoiceNo}
                        </Link>
                      </td>
                      <td className="font-mono text-slate-600 dark:text-slate-400">
                        {inv.vendorInvoiceNo || '—'}
                      </td>
                      <td>
                        <div className="font-bold text-slate-900 dark:text-slate-100">{inv.vendorName}</div>
                        {inv.vendorTaxNo && (
                          <div className="text-[10px] font-mono text-slate-400">الضريبي: {inv.vendorTaxNo}</div>
                        )}
                      </td>
                      <td>
                        {inv.projectName ? (
                          <span className="font-medium text-slate-800 dark:text-slate-200">
                            {inv.projectCode} — {inv.projectName}
                          </span>
                        ) : (
                          <span className="text-slate-400">مصروف عام</span>
                        )}
                      </td>
                      <td className="font-mono text-slate-700 dark:text-slate-300">{inv.issueDate}</td>
                      <td className="num font-mono">{money(inv.subtotal)}</td>
                      <td className="num font-mono text-emerald-700 dark:text-emerald-400">{money(inv.vatAmount)}</td>
                      <td className="num font-mono font-bold text-slate-900 dark:text-slate-100">
                        {isDebit ? `-${money(inv.totalAmount)}` : money(inv.totalAmount)}
                      </td>
                      <td>
                        {inv.journalEntryId ? (
                          <JournalLinkBadge entryId={inv.journalEntryId} entryNo={inv.journalEntryNo} compact />
                        ) : (
                          <span className="text-[11px] text-slate-400">ينشأ عند الاعتماد</span>
                        )}
                      </td>
                      <td>
                        <Badge color={inv.status === 'POSTED' ? 'green' : inv.status === 'CANCELLED' ? 'red' : 'slate'}>
                          {inv.status === 'POSTED' ? 'مرحّل بالدفاتر' : inv.status === 'CANCELLED' ? 'ملغى' : 'مسودة'}
                        </Badge>
                      </td>
                      <td className="text-end">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            className="btn-ghost h-7 px-2 text-xs"
                            onClick={() => navigate(`/pur/invoices/${inv.id}`)}
                            title="عرض التفاصيل والسند"
                          >
                            عرض
                          </button>
                          {inv.status === 'DRAFT' && (
                            <button
                              className="btn-ghost h-7 px-2 text-xs text-emerald-600 hover:text-emerald-700 font-semibold"
                              onClick={() => doPost(inv.id)}
                              title="ترحيل الفاتورة وتوليد القيد المحاسبي"
                            >
                              ترحيل آلي
                            </button>
                          )}
                          {inv.status !== 'CANCELLED' && (
                            <button
                              className="btn-ghost h-7 px-2 text-xs text-rose-600 hover:text-rose-700"
                              onClick={() => setCancelTargetId(inv.id)}
                              title="إلغاء الفاتورة وعكس القيد"
                            >
                              إلغاء
                            </button>
                          )}
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

      <CreatePurchaseInvoiceModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={() => {
          qc.invalidateQueries({ queryKey: ['/purchase-invoices'] });
          setShowCreateModal(false);
        }}
      />

      <ReasonDialog
        open={!!cancelTargetId}
        title="إلغاء فاتورة المشتريات"
        confirmText="تأكيد الإلغاء وعكس القيد المحاسبي"
        danger
        onClose={() => setCancelTargetId(null)}
        onConfirm={async (reason) => {
          if (!cancelTargetId) return;
          try {
            await api.post(`/purchase-invoices/${cancelTargetId}/cancel`, { reason });
            toast.success('تم إلغاء الفاتورة وعكس القيد المحاسبي بنجاح');
            qc.invalidateQueries({ queryKey: ['/purchase-invoices'] });
            setCancelTargetId(null);
          } catch (e) {
            toast.error(e);
          }
        }}
      />
    </div>
  );
}

// Preset Tech Purchases
const PURCHASE_PRESETS = [
  { label: 'سيرفرات واستضافة AWS / Cloud', itemType: 'SERVER_HOSTING', desc: 'استضافة الخوادم وقواعد البيانات السحابية الشهرية للمشاريع', defaultRate: 3500 },
  { label: 'تراخيص برمجية وأدوات IDE', itemType: 'SOFTWARE_LICENSE', desc: 'تراخيص بيئات التطوير والاشتراكات السحابية للمبرمجين', defaultRate: 850 },
  { label: 'استشارات خارجية ومقاول باطن', itemType: 'SUBCONTRACTOR', desc: 'أتعاب استشارات هندسة برمجية وأمن سيبراني لمشروع محدد', defaultRate: 7500 },
  { label: 'أجهزة ولابتوبات للمطورين', itemType: 'EQUIPMENT', desc: 'شراء أجهزة لابتوب ومعدات عمل تقنية للكوادر البرمجية', defaultRate: 5500 },
];

function CreatePurchaseInvoiceModal({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: () => void }) {
  const toast = useToast();
  const [vendorId, setVendorId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [periodId, setPeriodId] = useState('');
  const [vendorInvoiceNo, setVendorInvoiceNo] = useState('');
  const [issueDate, setIssueDate] = useState(today());
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('شروط السداد: تحويل بنكي للمورد خلال 30 يوماً.');
  const [autoPost, setAutoPost] = useState(true);
  const [busy, setBusy] = useState(false);

  // Queries (only load when modal opens and reuse cached reference catalogs)
  const vendors = useQuery({
    queryKey: ['ref', '/vendors', undefined],
    enabled: open,
    staleTime: 5 * 60 * 1000,
    queryFn: () => api.get<Page<any>>('/vendors', { pageSize: 200 }),
  });
  const projects = useQuery({
    queryKey: ['ref', '/projects', undefined],
    enabled: open,
    staleTime: 5 * 60 * 1000,
    queryFn: () => api.get<Page<any>>('/projects', { pageSize: 200 }),
  });
  const accounts = useQuery({
    queryKey: ['accounts', false],
    enabled: open,
    staleTime: 5 * 60 * 1000,
    queryFn: () => api.get<Page<any>>('/accounts', { pageSize: 200 }),
  });

  const vendorOptions = useMemo(() => {
    const list = Array.isArray(vendors.data) ? vendors.data : (vendors.data?.data ?? []);
    return list.map((v: any) => ({ value: v.id, label: `${v.code} — ${v.nameAr}` }));
  }, [vendors.data]);

  const projectOptions = useMemo(() => {
    const list = Array.isArray(projects.data) ? projects.data : (projects.data?.data ?? []);
    return list.map((p: any) => ({ value: p.id, label: `${p.code} — ${p.nameAr}` }));
  }, [projects.data]);

  const expenseAccounts = useMemo(
    () =>
      (Array.isArray(accounts.data) ? accounts.data : (accounts.data?.data ?? [])).filter(
        (a: any) => a.accountClass === 'OPERATING_EXPENSE' || a.code.startsWith('5')
      ),
    [accounts.data]
  );

  const expenseAccountOptions = useMemo(
    () => expenseAccounts.map((acc: any) => ({ value: acc.id, label: `[${acc.code}] ${acc.nameAr}` })),
    [expenseAccounts]
  );

  const [lines, setLines] = useState([
    {
      itemType: 'SERVER_HOSTING',
      description: 'استضافة خوادم سحابية وبنية تحتية للمشاريع',
      expenseAccountId: '',
      quantity: 1,
      unitPrice: 3500,
      discountAmount: 0,
      vatRate: 15,
    },
  ]);

  const addPreset = (preset: typeof PURCHASE_PRESETS[0]) => {
    const defaultAcc = expenseAccounts[0]?.id || '';
    setLines((prev) => [
      ...prev,
      {
        itemType: preset.itemType,
        description: preset.desc,
        expenseAccountId: defaultAcc,
        quantity: 1,
        unitPrice: preset.defaultRate,
        discountAmount: 0,
        vatRate: 15,
      },
    ]);
  };

  const removeLine = (idx: number) => {
    if (lines.length <= 1) return;
    setLines((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateLine = (idx: number, patch: Partial<typeof lines[0]>) => {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  const subtotal = lines.reduce((acc, l) => acc + (Number(l.quantity) * Number(l.unitPrice) - Number(l.discountAmount || 0)), 0);
  const vatAmount = lines.reduce((acc, l) => {
    const net = Number(l.quantity) * Number(l.unitPrice) - Number(l.discountAmount || 0);
    return acc + net * (Number(l.vatRate || 15) / 100);
  }, 0);
  const totalAmount = subtotal + vatAmount;

  const handleSubmit = async () => {
    if (!vendorId) {
      toast.error(new Error('يرجى اختيار المورد'));
      return;
    }
    if (!periodId) {
      toast.error(new Error('يرجى تحديد الفترة المالية'));
      return;
    }
    const defaultAcc = expenseAccounts[0]?.id;
    for (const l of lines) {
      if (!l.expenseAccountId && !defaultAcc) {
        toast.error(new Error('يرجى تحديد حساب المصروف لجميع البنود'));
        return;
      }
    }

    setBusy(true);
    try {
      const res: any = await api.post('/purchase-invoices', {
        vendorId,
        projectId: projectId || undefined,
        fiscalPeriodId: periodId,
        vendorInvoiceNo: vendorInvoiceNo || undefined,
        issueDate,
        dueDate: dueDate || undefined,
        currencyCode: 'SAR',
        exchangeRate: '1',
        notes,
        lines: lines.map((l) => ({
          ...l,
          expenseAccountId: l.expenseAccountId || defaultAcc,
        })),
      });

      if (autoPost) {
        await api.post(`/purchase-invoices/${res.id}/post`);
        toast.success('تم تسجيل الفاتورة وترحيل القيد المحاسبي آلياً بالدفاتر');
      } else {
        toast.success('تم حفظ مسودة فاتورة المشتريات بنجاح');
      }
      onSuccess();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title="تسجيل فاتورة مشتريات / مصروفات جديدة"
      onClose={onClose}
      size="xl"
      dirty={Boolean(vendorId || projectId || vendorInvoiceNo || lines.length > 1)}
      saving={busy}
      onSaveShortcut={handleSubmit}
      footer={
        <>
          <button type="button" className="btn-secondary" disabled={busy} onClick={onClose}>إلغاء</button>
          <button type="button" className="btn-primary flex items-center gap-1.5" disabled={busy} onClick={handleSubmit}>
            <Save className="size-3.5" />
            {busy ? 'جاري الحفظ والاعتماد...' : 'حفظ واعتماد الفاتورة'}
          </button>
        </>
      }
    >
      <div className="space-y-4 text-xs">
        {/* Quick Presets */}
        <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
          <div className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
            <Sparkles className="size-3.5 text-indigo-600" /> نماذج مشتريات ومصروفات جاهزة للشركات التقنية:
          </div>
          <div className="flex flex-wrap gap-2">
            {PURCHASE_PRESETS.map((p, idx) => (
              <button
                key={idx}
                type="button"
                className="btn-secondary text-[11px] py-1 px-2.5 h-auto hover:border-indigo-500 hover:text-indigo-600"
                onClick={() => addPreset(p)}
              >
                + {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Header Metadata */}
        <FormSection title="بيانات المورد والفترة المالية والتواريخ" columns={3}>
          <Field label="المورد" required>
            <SearchableSelect
              options={vendorOptions}
              loading={vendors.isLoading}
              value={vendorId}
              onChange={setVendorId}
              placeholder="— ابحث واختر المورد —"
              clearable={false}
              autoFocus
            />
          </Field>
          <Field label="المشروع المرتبط (اختياري)">
            <SearchableSelect
              options={projectOptions}
              loading={projects.isLoading}
              value={projectId}
              onChange={setProjectId}
              placeholder="مصروف عام (بدون مشروع)"
            />
          </Field>
          <Field label="الفترة المالية المحاسبية" required>
            <PeriodSelect value={periodId} onChange={setPeriodId} className="w-full" />
          </Field>
          <Field label="رقم فاتورة المورد الخارجية">
            <input className="input font-mono" dir="ltr" placeholder="INV-AWS-2026-99" value={vendorInvoiceNo} onChange={(e) => setVendorInvoiceNo(e.target.value)} />
          </Field>
          <Field label="تاريخ إصدار الفاتورة">
            <input type="date" dir="ltr" className="input font-mono" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
          </Field>
          <Field label="تاريخ الاستحقاق">
            <input type="date" dir="ltr" className="input font-mono" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
        </FormSection>

        <div className="flex items-center rounded-xl border border-slate-200/80 dark:border-slate-800 px-3.5 py-2.5 bg-slate-50/70 dark:bg-slate-900/50">
          <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-800 dark:text-slate-200">
            <input type="checkbox" className="rounded border-slate-300 text-brand-600 focus:ring-brand-500" checked={autoPost} onChange={(e) => setAutoPost(e.target.checked)} />
            <span>ترحيل الفاتورة وتوليد القيد المحاسبي فوراً</span>
          </label>
        </div>

        {/* Line Items Table */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-slate-900 dark:text-slate-100">بنود الفاتورة والمصروفات:</h4>
            <button
              type="button"
              className="btn-secondary text-[11px] py-1 px-2.5 h-auto flex items-center gap-1"
              onClick={() => {
                const defaultAcc = expenseAccounts[0]?.id || '';
                setLines((prev) => [
                  ...prev,
                  {
                    itemType: 'EXPENSE',
                    description: '',
                    expenseAccountId: defaultAcc,
                    quantity: 1,
                    unitPrice: 1000,
                    discountAmount: 0,
                    vatRate: 15,
                  },
                ]);
              }}
            >
              <Plus className="size-3.5" /> إضافة بند يدوي
            </button>
          </div>

          <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto shadow-xs">
            <table className="table w-full text-xs">
              <thead className="bg-slate-100/80 dark:bg-slate-800">
                <tr>
                  <th style={{ width: '22%' }}>نوع البند</th>
                  <th style={{ width: '30%' }}>الوصف والبيان</th>
                  <th style={{ width: '20%' }}>حساب المصروف المدين</th>
                  <th style={{ width: '8%' }} className="text-center">الكمية</th>
                  <th style={{ width: '10%' }} className="text-end">السعر</th>
                  <th style={{ width: '6%' }} className="text-center">الضريبة</th>
                  <th style={{ width: '12%' }} className="text-end">الإجمالي</th>
                  <th style={{ width: '4%' }}></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {lines.map((l, idx) => {
                  const lineNet = Number(l.quantity) * Number(l.unitPrice) - Number(l.discountAmount || 0);
                  const lineVat = lineNet * (Number(l.vatRate || 15) / 100);
                  const lineTotal = lineNet + lineVat;

                  return (
                    <tr key={idx} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                      <td>
                        <select className="input w-full text-xs py-1" value={l.itemType} onChange={(e) => updateLine(idx, { itemType: e.target.value })}>
                          <option value="SERVER_HOSTING">خوادم واستضافة سحابية</option>
                          <option value="SOFTWARE_LICENSE">تراخيص برمجيات وسحابة</option>
                          <option value="SUBCONTRACTOR">استشارات خارجية ومقاول باطن</option>
                          <option value="EQUIPMENT">أجهزة ومعدات تقنية</option>
                          <option value="SERVICE">خدمات عامة</option>
                          <option value="EXPENSE">مصروفات عمومية</option>
                        </select>
                      </td>
                      <td>
                        <input className="input w-full text-xs py-1" placeholder="بيان المصروف..." value={l.description} onChange={(e) => updateLine(idx, { description: e.target.value })} />
                      </td>
                      <td className="min-w-[200px]">
                        <SearchableSelect
                          options={expenseAccountOptions}
                          loading={accounts.isLoading}
                          value={l.expenseAccountId}
                          onChange={(val) => updateLine(idx, { expenseAccountId: val })}
                          placeholder="— حساب المصروف —"
                          clearable={false}
                        />
                      </td>
                      <td>
                        <input type="number" step="1" min="1" className="input w-full text-xs py-1 text-center font-mono font-bold" value={l.quantity} onChange={(e) => updateLine(idx, { quantity: parseFloat(e.target.value) || 0 })} />
                      </td>
                      <td>
                        <input type="number" step="50" min="0" className="input w-full text-xs py-1 text-end font-mono font-medium" value={l.unitPrice} onChange={(e) => updateLine(idx, { unitPrice: parseFloat(e.target.value) || 0 })} />
                      </td>
                      <td className="text-center font-mono font-medium text-slate-500">15%</td>
                      <td className="text-end font-mono font-bold text-emerald-800 dark:text-emerald-300">
                        {money(lineTotal)}
                      </td>
                      <td className="text-center">
                        <button type="button" className="text-slate-400 hover:text-rose-600 p-1" onClick={() => removeLine(idx)} disabled={lines.length <= 1}>
                          <Trash2 className="size-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Live Summary & Tafqeet */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
          <div className="space-y-2">
            <Field label="ملاحظات وشروط الدفع">
              <textarea className="input w-full h-20 text-xs py-2" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
            <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 p-3 space-y-1 text-xs">
              <div className="font-bold text-blue-900 dark:text-blue-300">القيد المحاسبي المتولد آلياً عند الاعتماد:</div>
              <div className="text-slate-700 dark:text-slate-300 font-mono text-[11px]">
                <div>• مدين (Dr): حسابات المصروفات ({money(subtotal)} ر.س)</div>
                <div>• مدين (Dr): ضريبة المدخلات 1250 ({money(vatAmount)} ر.س)</div>
                <div>• دائن (Cr): مستحقات الموردين 2300 ({money(totalAmount)} ر.س)</div>
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-800 p-4 space-y-2 text-xs shadow-xs">
            <div className="flex justify-between text-slate-600 dark:text-slate-400">
              <span>المجموع قبل الضريبة:</span>
              <span className="font-mono font-medium">{money(subtotal)} SAR</span>
            </div>
            <div className="flex justify-between text-amber-700 dark:text-amber-400 font-semibold">
              <span>ضريبة القيمة المضافة (15%):</span>
              <span className="font-mono">{money(vatAmount)} SAR</span>
            </div>
            <div className="pt-2 border-t border-slate-300 dark:border-slate-700 flex justify-between font-black text-base text-slate-900 dark:text-slate-100">
              <span>إجمالي الفاتورة المستحق للمورد:</span>
              <span className="font-mono text-emerald-700 dark:text-emerald-400">{money(totalAmount)} SAR</span>
            </div>
            <div className="text-[11px] text-slate-500 pt-1">
              <strong>كتابة: </strong> {tafqeetArabic(totalAmount, 'SAR')}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ============================================================================
// Purchase Invoice Detail Page & Official Printable Voucher
// ============================================================================
export function PurchaseInvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const toast = useToast();

  const [cancelOpen, setCancelOpen] = useState(false);
  const [debitNoteOpen, setDebitNoteOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [returnReason, setReturnReason] = useState('مردود مشتريات / تخفيض تكلفة خدمات');

  const invoice = useQuery({
    queryKey: ['/purchase-invoices', id],
    queryFn: () => api.get<any>(`/purchase-invoices/${id}`),
    enabled: !!id,
  });

  const inv = invoice.data;

  const doPost = async () => {
    if (!inv || !confirm('ترحيل هذه الفاتورة وتوليد القيد المحاسبي المزدوج آلياً في دفتر الأستاذ العام؟')) return;
    try {
      await api.post(`/purchase-invoices/${inv.id}/post`);
      toast.success('تم ترحيل فاتورة المشتريات وتوليد القيد المحاسبي بنجاح');
      qc.invalidateQueries({ queryKey: ['/purchase-invoices', id] });
    } catch (e) {
      toast.error(e);
    }
  };

  const doDebitNote = async () => {
    if (!inv) return;
    try {
      await api.post('/debit-notes', {
        originalInvoiceId: inv.id,
        returnReason,
      });
      toast.success('تم إصدار إشعار مدين (مردود مشتريات) وتوليد قيد العكس آلياً');
      qc.invalidateQueries({ queryKey: ['/purchase-invoices', id] });
      setDebitNoteOpen(false);
    } catch (e) {
      toast.error(e);
    }
  };

  if (invoice.isLoading) return <Loading />;
  if (invoice.isError || !inv) return <ErrorState error={invoice.error} />;

  const isDebitNote = inv.invoiceType === 'DEBIT_NOTE';

  return (
    <div className="space-y-6">
      {/* Top Action Bar */}
      <div className="print:hidden flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-sm">
        <div className="flex items-center gap-3">
          <Link to="/pur/invoices" className="btn-ghost flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900">
            <ArrowRight className="size-4" /> العودة للقائمة
          </Link>
          <div className="h-5 w-px bg-slate-200 dark:bg-slate-700" />
          <div className="flex items-center gap-2">
            <span className="font-bold text-lg text-slate-900 dark:text-slate-100 font-mono">{inv.invoiceNo}</span>
            <Badge color={inv.status === 'POSTED' ? 'green' : inv.status === 'CANCELLED' ? 'red' : 'slate'}>
              {inv.status === 'POSTED' ? 'مرحّلة بالدفاتر' : inv.status === 'CANCELLED' ? 'ملغاة' : 'مسودة'}
            </Badge>
            {inv.journalEntryId && (
              <Link
                to={`/acc/journals/${inv.journalEntryId}`}
                className="text-xs text-brand-600 hover:underline font-mono bg-brand-50 dark:bg-brand-950/60 px-2.5 py-1 rounded-lg border border-brand-200 dark:border-brand-800 flex items-center gap-1"
              >
                <FileText className="size-3" /> القيد المحاسبي: {inv.journalEntryNo}
              </Link>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {inv.status === 'DRAFT' && (
            <button className="btn-primary bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 text-xs shadow-sm" onClick={doPost}>
              <Send className="size-3.5" /> ترحيل الفاتورة وتوليد القيد آلياً
            </button>
          )}

          {inv.status === 'POSTED' && !isDebitNote && inv.paymentStatus !== 'PAID' && (
            <button
              className="btn-primary bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5 text-xs shadow-sm"
              onClick={() => setPaymentOpen(true)}
            >
              <Wallet className="size-3.5" /> تسجيل سداد للمورد (سند صرف)
            </button>
          )}

          {inv.status === 'POSTED' && !isDebitNote && (
            <button className="btn-secondary flex items-center gap-1.5 text-xs" onClick={() => setDebitNoteOpen(true)}>
              <RotateCcw className="size-3.5" /> إصدار إشعار مدين (مردود)
            </button>
          )}

          <ExportMenu
            title={isDebitNote ? `إشعار مدين مشتريات ${inv.invoiceNo}` : `سند استحقاق مشتريات ${inv.invoiceNo}`}
            filename={`Purchase-Voucher-${inv.invoiceNo}-${inv.issueDate}`}
            periodLabel={`تاريخ الإصدار: ${inv.issueDate} • المورد: ${inv.vendorName}`}
            currency={inv.currency || 'SAR'}
            columns={[
              { key: 'lineNo', header: '#', width: 6 },
              { key: 'description', header: 'البيان والتفاصيل', width: 30 },
              { key: 'accountName', header: 'حساب المصروف', width: 22 },
              { key: 'quantity', header: 'الكمية', width: 10, type: 'number' },
              { key: 'unitPrice', header: 'سعر الوحدة', width: 14, type: 'currency' },
              { key: 'vatAmount', header: 'الضريبة 15%', width: 14, type: 'currency', isTotal: true },
              { key: 'subtotal', header: 'المبلغ قبل الضريبة', width: 16, type: 'currency', isTotal: true },
              { key: 'totalAmount', header: 'الإجمالي شامل الضريبة', width: 18, type: 'currency', isTotal: true },
            ]}
            data={(inv.lines ?? []).map((l: any, idx: number) => ({
              ...l,
              lineNo: idx + 1,
              accountName: l.accountNameAr || l.accountName || l.accountId,
            }))}
          />

          <button
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-l from-rose-600 to-red-600 px-3 py-1.5 text-xs font-extrabold text-white shadow-sm hover:brightness-110 transition-all"
            onClick={() =>
              void ExportEngine.exportDetailPdf({
                title: isDebitNote ? `إشعار مدين / مردودات مشتريات ${inv.invoiceNo}` : `سند استحقاق فاتورة مشتريات ${inv.invoiceNo}`,
                subtitle: 'مستند التزام رسمي معتمد ومثبت بالدفاتر المحاسبية العامة',
                filename: `Purchase-Voucher-${inv.invoiceNo}-${inv.issueDate}`,
                docNo: inv.invoiceNo,
                docDate: inv.issueDate,
                currency: inv.currency || 'SAR',
                statusLabel: inv.status === 'POSTED' ? 'مرحّلة ومعتمدة' : inv.status === 'CANCELLED' ? 'ملغاة' : 'مسودة',
                statusTone: inv.status === 'POSTED' ? 'green' : inv.status === 'CANCELLED' ? 'red' : 'amber',
                watermark: inv.status === 'CANCELLED' ? 'CANCELLED' : inv.status === 'DRAFT' ? 'DRAFT' : 'NONE',
                kpis: [
                  { label: 'المبلغ قبل الضريبة', value: `${money(inv.subtotal)} ${inv.currency || 'SAR'}`, tone: 'navy' },
                  { label: 'ضريبة القيمة المضافة 15%', value: `${money(inv.vatAmount)} ${inv.currency || 'SAR'}`, tone: 'amber' },
                  { label: 'الإجمالي شامل الضريبة', value: `${money(inv.totalAmount)} ${inv.currency || 'SAR'}`, tone: 'emerald' },
                  { label: 'حالة السداد', value: inv.paymentStatus === 'PAID' ? 'مسددة بالكامل' : 'مستحقة السداد', tone: inv.paymentStatus === 'PAID' ? 'emerald' : 'rose' },
                ],
                metaFields: [
                  { label: 'رقم السند الداخلي', value: inv.invoiceNo },
                  { label: 'فاتورة المورد الأصلية', value: inv.vendorInvoiceNo || '—' },
                  { label: 'اسم المورد', value: inv.vendorName || '—' },
                  { label: 'تاريخ الإصدار', value: inv.issueDate },
                  { label: 'تاريخ الاستحقاق', value: inv.dueDate || '—' },
                  { label: 'رقم القيد المحاسبي', value: inv.journalEntryNo || '—' },
                ],
                sections: [
                  {
                    title: 'بنود المشتريات والمصروفات المحاسبية',
                    columns: [
                      { key: 'lineNo', header: '#', width: 6, type: 'number' },
                      { key: 'description', header: 'البيان والتفاصيل', width: 30 },
                      { key: 'accountName', header: 'حساب المصروف', width: 22 },
                      { key: 'quantity', header: 'الكمية', width: 10, type: 'number' },
                      { key: 'unitPrice', header: 'سعر الوحدة', width: 14, type: 'currency' },
                      { key: 'subtotal', header: 'قبل الضريبة', width: 15, type: 'currency', isTotal: true },
                      { key: 'vatAmount', header: 'الضريبة 15%', width: 14, type: 'currency', isTotal: true },
                      { key: 'totalAmount', header: 'الإجمالي', width: 16, type: 'currency', isTotal: true },
                    ],
                    data: (inv.lines ?? []).map((l: any, idx: number) => ({
                      ...l,
                      lineNo: idx + 1,
                      accountName: l.accountNameAr || l.accountName || l.accountId,
                    })),
                  },
                ],
                totalAmountForTafqeet: Number(inv.totalAmount || 0),
                notes: inv.notes || undefined,
                signatureLabels: ['مسؤول المشتريات', 'المحاسب المالي', 'اعتماد الإدارة المالية'],
              })
            }
          >
            <Printer className="size-3.5" /> طباعة السند الملكي (A4)
          </button>

          {inv.status !== 'CANCELLED' && (
            <button className="btn-ghost text-rose-600 hover:bg-rose-50 text-xs" onClick={() => setCancelOpen(true)}>
              إلغاء الفاتورة
            </button>
          )}
        </div>
      </div>

      {/* Official Printable Voucher */}
      <div className="card p-8 sm:p-10 bg-white dark:bg-slate-900 border-2 border-slate-300 dark:border-slate-700 rounded-2xl shadow-xl space-y-6 print:shadow-none print:border-none print:p-0">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-6 border-b-2 border-slate-200 pb-6">
          <div>
            <div className="text-xl font-black text-slate-950 dark:text-slate-50 tracking-tight">
              {isDebitNote ? 'إشعار مدين / مردودات مشتريات معتمد' : 'سند استحقاق فاتورة مشتريات ومصروفات'}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              مستند قيد التزام رسمي مثبت بالدفاتر المحاسبية العامة
            </div>
          </div>
          <div className="text-end space-y-1">
            <div className="font-mono font-black text-lg text-brand-600">{inv.invoiceNo}</div>
            <div className="text-xs text-slate-500">تاريخ الإصدار: <span className="font-mono font-bold text-slate-800">{inv.issueDate}</span></div>
            {inv.vendorInvoiceNo && (
              <div className="text-xs text-slate-500">فاتورة المورد الأصلية: <span className="font-mono font-bold">{inv.vendorInvoiceNo}</span></div>
            )}
          </div>
        </div>

        {/* Vendor & Project Info */}
        <div className="grid grid-cols-2 gap-4 text-xs bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
          <div className="space-y-1">
            <div className="font-bold text-slate-700 dark:text-slate-300">بيانات المورد (الدائن):</div>
            <div className="text-base font-black text-slate-900 dark:text-slate-100">{inv.vendorName}</div>
            {inv.vendorTaxNo && <div>الرقم الضريبي: <span className="font-mono font-bold">{inv.vendorTaxNo}</span></div>}
            {inv.vendorCr && <div>السجل التجاري: <span className="font-mono">{inv.vendorCr}</span></div>}
          </div>
          <div className="space-y-1 text-end">
            <div className="font-bold text-slate-700 dark:text-slate-300">تخصيص المشروع والجهة المستفيدة:</div>
            <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
              {inv.projectName ? `${inv.projectCode} — ${inv.projectName}` : 'مصروفات تشغيلية وإدارية عامة'}
            </div>
            <div>الفترة المحاسبية: <span className="font-semibold">{inv.periodName}</span></div>
            {inv.journalEntryNo && (
              <div className="text-emerald-700 dark:text-emerald-400 font-bold">
                رقم القيد الدفتري: <span className="font-mono">{inv.journalEntryNo}</span>
              </div>
            )}
          </div>
        </div>

        {/* Lines Table */}
        <table className="table w-full text-xs">
          <thead>
            <tr>
              <th>#</th>
              <th>البيان والتفاصيل</th>
              <th>حساب المصروف المدين</th>
              <th className="num">الكمية</th>
              <th className="num">السعر</th>
              <th className="num">ضريبة المدخلات 15%</th>
              <th className="num">الإجمالي شامل الضريبة</th>
            </tr>
          </thead>
          <tbody>
            {inv.lines?.map((l: any, idx: number) => (
              <tr key={l.id}>
                <td className="font-mono">{idx + 1}</td>
                <td className="font-medium">{l.description}</td>
                <td className="font-mono">[{l.accountCode}] {l.accountName}</td>
                <td className="num font-mono">{l.quantity}</td>
                <td className="num font-mono">{money(l.unitPrice)}</td>
                <td className="num font-mono text-emerald-700">{money(l.vatAmount)}</td>
                <td className="num font-mono font-bold text-slate-900 dark:text-slate-100">{money(l.totalAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals & Tafqeet */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start pt-4 border-t border-slate-200">
          <div className="space-y-1 text-xs">
            <div className="font-bold text-slate-800">المبلغ الإجمالي كتابة (Tafqeet):</div>
            <div className="font-medium text-emerald-800">{tafqeetArabic(inv.totalAmount, inv.currencyCode)}</div>
            <div className="text-[11px] text-slate-500 font-sans">{tafqeetEnglish(inv.totalAmount, inv.currencyCode)}</div>
          </div>
          <div className="rounded-xl bg-slate-50 p-4 space-y-2 text-xs">
            <div className="flex justify-between"><span>المبلغ الصافي قبل الضريبة:</span><span className="font-mono font-bold">{money(inv.subtotal)} {inv.currencyCode}</span></div>
            <div className="flex justify-between text-emerald-700"><span>ضريبة المدخلات المستردة (15%):</span><span className="font-mono font-bold">{money(inv.vatAmount)} {inv.currencyCode}</span></div>
            <div className="pt-2 border-t flex justify-between font-black text-base text-slate-900">
              <span>إجمالي مستحقات المورد:</span>
              <span className="font-mono text-emerald-800">{money(inv.totalAmount)} {inv.currencyCode}</span>
            </div>
          </div>
        </div>

        {/* Official Signature Stamps */}
        <div className="grid grid-cols-3 gap-6 pt-10 text-center text-xs text-slate-600 border-t border-slate-200">
          <div><div className="font-bold text-slate-800">مسؤول المشتريات</div><div className="h-12" /><div className="border-t border-dashed pt-1">التوقيع والتاريخ</div></div>
          <div><div className="font-bold text-slate-800">تدقيق الحسابات</div><div className="h-12" /><div className="border-t border-dashed pt-1">التوقيع والتاريخ</div></div>
          <div><div className="font-bold text-slate-800">اعتماد الإدارة المالية</div><div className="h-12" /><div className="border-t border-dashed pt-1">الختم والاعتماد</div></div>
        </div>
      </div>

      {/* Debit Note Modal */}
      <Modal
        open={debitNoteOpen}
        title="إصدار إشعار مدين (مردود مشتريات)"
        onClose={() => setDebitNoteOpen(false)}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setDebitNoteOpen(false)}>إلغاء</button>
            <button className="btn-primary" onClick={doDebitNote}>إصدار وترحيل الإشعار</button>
          </>
        }
      >
        <div className="space-y-3 text-xs">
          <p className="text-slate-600">سيتم إصدار إشعار مدين للفاتورة رقم <strong>{inv.invoiceNo}</strong> وتوليد قيد العكس المحاسبي آلياً بالدفاتر لتخفيض التزام المورد.</p>
          <Field label="سبب الإشعار المدين / المردود">
            <textarea className="input w-full h-20" value={returnReason} onChange={(e) => setReturnReason(e.target.value)} />
          </Field>
        </div>
      </Modal>

      {/* Vendor Payments History */}
      {Array.isArray(inv.payments) && inv.payments.length > 0 && (
        <div className="print:hidden card p-4 border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/40 dark:bg-indigo-950/20">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-bold text-xs text-indigo-900 dark:text-indigo-200 flex items-center gap-1.5">
              <Wallet className="size-3.5 text-indigo-600" /> سجل سندات الصرف والمدفوعات للمورد
            </h4>
            <Badge color={inv.paymentStatus === 'PAID' ? 'green' : 'amber'}>
              {inv.paymentStatus === 'PAID' ? 'مسددة بالكامل' : 'مسددة جزئياً'} — المدفوع: {money(inv.paidAmount)}
            </Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="table text-xs">
              <thead><tr><th>التاريخ</th><th>المرجع</th><th>المبلغ</th><th>الحساب الدافع</th><th>القيد المحاسبي</th></tr></thead>
              <tbody>
                {inv.payments.map((p: any) => (
                  <tr key={p.id}>
                    <td className="num">{p.paymentDate}</td>
                    <td className="font-mono">{p.reference}</td>
                    <td className="num font-bold text-indigo-700 dark:text-indigo-400">{money(p.amount)}</td>
                    <td className="font-mono">{p.bankGlCode}</td>
                    <td>
                      {p.journalEntryId ? (
                        <JournalLinkBadge entryId={p.journalEntryId} entryNo={p.journalEntryNo} compact />
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Treasury Vendor Payment Modal */}
      <TreasuryPaymentModal
        open={paymentOpen}
        mode="PAYMENT"
        invoiceId={inv.id}
        invoiceNo={inv.invoiceNo}
        partyName={inv.vendorName}
        totalAmount={Number(inv.totalAmount || 0)}
        paidAmount={Number(inv.paidAmount || 0)}
        currencyCode={inv.currencyCode || 'SAR'}
        onClose={() => setPaymentOpen(false)}
        onSuccess={() => {
          qc.invalidateQueries({ queryKey: ['/purchase-invoices', id] });
          qc.invalidateQueries({ queryKey: ['/purchase-invoices'] });
          qc.invalidateQueries({ queryKey: ['/bank-accounts'] });
          qc.invalidateQueries({ queryKey: ['bank-accounts-hub'] });
          qc.invalidateQueries({ queryKey: ['accounts'] });
        }}
      />

      {/* Cancel Dialog */}
      <ReasonDialog
        open={cancelOpen}
        title="إلغاء فاتورة المشتريات"
        confirmText="تأكيد الإلغاء وعكس القيد"
        danger
        onClose={() => setCancelOpen(false)}
        onConfirm={async (reason) => {
          try {
            await api.post(`/purchase-invoices/${inv.id}/cancel`, { reason });
            toast.success('تم إلغاء الفاتورة وعكس القيد');
            qc.invalidateQueries({ queryKey: ['/purchase-invoices', id] });
            setCancelOpen(false);
          } catch (e) {
            toast.error(e);
          }
        }}
      />
    </div>
  );
}

// ============================================================================
// Purchase Debit Notes Page
// ============================================================================
export function PurchaseDebitNotesPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const debitNotes = useQuery({
    queryKey: ['/debit-notes'],
    queryFn: () => api.get<Page<any>>('/debit-notes', { pageSize: 100 }),
  });

  const list = Array.isArray(debitNotes.data) ? debitNotes.data : (debitNotes.data?.data ?? []);

  return (
    <div className="space-y-5">
      <PageHeader
        title="إشعارات مدينة ومردودات المشتريات"
        subtitle="سجل مردودات المشتريات والتخفيضات المعتمدة من الموردين، مع القيود المحاسبية العكسية التلقائية."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ExportMenu
              title="إشعارات مدينة ومردودات المشتريات"
              columns={[
                { key: 'invoiceNo', header: 'رقم الإشعار المدين', width: 16 },
                { key: 'vendorName', header: 'المورد', width: 22 },
                { key: 'projectName', header: 'المشروع', width: 20 },
                { key: 'issueDate', header: 'تاريخ الإصدار', width: 14 },
                { key: 'subtotal', header: 'قبل الضريبة', width: 15, type: 'currency', isTotal: true },
                { key: 'vatAmount', header: 'الضريبة', width: 14, type: 'currency', isTotal: true },
                { key: 'totalAmount', header: 'الإجمالي', width: 16, type: 'currency', isTotal: true },
                { key: 'status', header: 'الحالة', width: 12 },
              ]}
              data={list}
            />
          </div>
        }
      />

      <div className="card overflow-hidden">
        {debitNotes.isLoading ? (
          <Loading />
        ) : debitNotes.isError ? (
          <ErrorState error={debitNotes.error} />
        ) : list.length === 0 ? (
          <EmptyState text="لا توجد إشعارات مدينة مسجلة حتى الآن." />
        ) : (
          <table className="table w-full text-xs">
            <thead>
              <tr>
                <th>رقم الإشعار</th>
                <th>المورد</th>
                <th>المشروع</th>
                <th>تاريخ الإصدار</th>
                <th>المبلغ قبل الضريبة</th>
                <th>ضريبة 15%</th>
                <th>الإجمالي المسترد</th>
                <th>القيد المحاسبي العكسي</th>
                <th>الحالة</th>
                <th className="text-end">الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {list.map((d) => (
                <tr key={d.id} className="hover:bg-slate-50/80">
                  <td className="font-mono font-bold text-brand-600">{d.invoiceNo}</td>
                  <td className="font-bold">{d.vendorName}</td>
                  <td>{d.projectName || '—'}</td>
                  <td className="font-mono">{d.issueDate}</td>
                  <td className="num font-mono">{money(d.subtotal)}</td>
                  <td className="num font-mono text-emerald-700">{money(d.vatAmount)}</td>
                  <td className="num font-mono font-bold text-rose-600">-{money(d.totalAmount)}</td>
                  <td>
                    <JournalLinkBadge entryId={d.journalEntryId} entryNo={d.journalEntryNo} compact />
                  </td>
                  <td><Badge color="green">مرحّل ومعتمد</Badge></td>
                  <td className="text-end">
                    <ActionGroup>
                      <ActionButton
                        variant="view"
                        title="معاينة سند الاستحقاق"
                        onClick={() => navigate(`/pur/invoices/${d.id}`)}
                      />
                      <ActionButton
                        variant="print"
                        title="طباعة سند الاستحقاق"
                        onClick={() => window.open(`#/pur/invoices/${d.id}?print=true`, '_blank')}
                      />
                      <ActionButton
                        variant="edit"
                        title="تعديل الفاتورة"
                        onClick={() => navigate(`/pur/invoices/${d.id}`)}
                      />
                      <ActionButton
                        variant="delete"
                        title="إلغاء الفاتورة"
                        onClick={() => {
                          if (confirm(`إلغاء فاتورة المشتريات ${d.invoiceNo}؟`)) {
                            api.post(`/pur/invoices/${d.id}/cancel`, { reason: 'إلغاء بناءً على طلب المستخدم' })
                              .then(() => {
                                toast.success('تم إلغاء الفاتورة');
                                qc.invalidateQueries({ queryKey: ['/purchase-invoices'] });
                              })
                              .catch((err) => toast.error(err));
                          }
                        }}
                      />
                    </ActionGroup>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
