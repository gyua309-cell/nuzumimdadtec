import { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, CheckCircle2, Eye, FileSpreadsheet, FileUp,
  Pencil, Plus, Printer, Search, Tag, Trash2, Upload, X,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { money, today } from '../lib/format';
import {
  Badge, Drawer, EmptyState, ErrorState, Field, Loading, Modal, PageHeader, Spinner, useToast,
} from '../components/ui';
import { ExportMenu } from '../components/ExportMenu';

export interface ServiceItem {
  id: string;
  code: string;
  nameAr: string;
  nameEn?: string;
  category: 'SOFTWARE_DEVELOPMENT' | 'CLOUD_DEVOPS' | 'QA_TESTING' | 'ACCOUNTING_FINANCE' | 'PROJECT_MANAGEMENT' | 'TECHNICAL_CONSULTING';
  billingBasis: 'DAILY' | 'MONTHLY' | 'HOURLY' | 'FIXED';
  defaultUnitPrice: number | string;
  currencyCode: 'SAR' | 'EGP' | 'USD';
  vatRate: number | string;
  glAccountId?: string;
  description?: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

const CATEGORY_LABELS: Record<string, { label: string; color: 'blue' | 'purple' | 'cyan' | 'emerald' | 'amber' | 'slate' }> = {
  SOFTWARE_DEVELOPMENT: { label: 'تطوير البرمجيات والأنظمة', color: 'blue' },
  CLOUD_DEVOPS: { label: 'السحابة والبنية التحتية (DevOps)', color: 'cyan' },
  QA_TESTING: { label: 'اختبارات وضمان الجودة (QA)', color: 'emerald' },
  ACCOUNTING_FINANCE: { label: 'المحاسبة والخدمات المالية', color: 'purple' },
  PROJECT_MANAGEMENT: { label: 'إدارة المشاريع والتحول الرقمي', color: 'amber' },
  TECHNICAL_CONSULTING: { label: 'استشارات تقنية وفنية', color: 'slate' },
  software: { label: 'تطوير البرمجيات والأنظمة', color: 'blue' },
  devops: { label: 'السحابة والبنية التحتية (DevOps)', color: 'cyan' },
  qa: { label: 'اختبارات وضمان الجودة (QA)', color: 'emerald' },
  accounting: { label: 'المحاسبة والخدمات المالية', color: 'purple' },
  pmo: { label: 'إدارة المشاريع والتحول الرقمي', color: 'amber' },
  consulting: { label: 'استشارات تقنية وفنية', color: 'slate' },
};

const BILLING_BASIS_LABELS: Record<string, string> = {
  DAILY: 'يومية عمل (Daily Rate)',
  MONTHLY: 'شهر تعاقدي (Monthly Retainer)',
  HOURLY: 'ساعة عمل (Hourly T&M)',
  FIXED: 'مبلغ مقطوع (Fixed Milestone)',
  daily: 'يومية عمل (Daily Rate)',
  monthly: 'شهر تعاقدي (Monthly Retainer)',
  hourly: 'ساعة عمل (Hourly T&M)',
  fixed: 'مبلغ مقطوع (Fixed Milestone)',
};

const INITIAL_SERVICES: ServiceItem[] = [];

export function ServiceCatalogPage() {
  const { company } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();

  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('ALL');
  const [viewingService, setViewingService] = useState<ServiceItem | null>(null);
  const [editingService, setEditingService] = useState<ServiceItem | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  // Load services with local persistence fallback
  const query = useQuery({
    queryKey: ['/services/catalog', filterCategory],
    queryFn: async () => {
      try {
        const res = await api.get<any>('/services/catalog');
        const data = Array.isArray(res) ? res : res?.data || [];
        if (data.length > 0) return data as ServiceItem[];
      } catch {
        // Fall back to stored services
      }
      const raw = localStorage.getItem('azm_services_catalog');
      if (raw) {
        try {
          return JSON.parse(raw) as ServiceItem[];
        } catch {
          // ignore
        }
      }
      return [];
    },
  });

  const services = useMemo(() => {
    let list = query.data || [];
    if (filterCategory !== 'ALL') {
      list = list.filter((s) => s.category === filterCategory);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (s) =>
          s.code.toLowerCase().includes(q) ||
          s.nameAr.toLowerCase().includes(q) ||
          (s.nameEn && s.nameEn.toLowerCase().includes(q)) ||
          (s.description && s.description.toLowerCase().includes(q))
      );
    }
    return list;
  }, [query.data, filterCategory, search]);

  // Form State
  const [formData, setFormData] = useState<Partial<ServiceItem>>({
    code: '',
    nameAr: '',
    nameEn: '',
    category: 'SOFTWARE_DEVELOPMENT',
    billingBasis: 'DAILY',
    defaultUnitPrice: '',
    currencyCode: 'SAR',
    vatRate: 15,
    glAccountId: '40101',
    description: '',
    isActive: true,
  });

  // CSV Import State & Handlers
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFile(file);
    setImportErrors([]);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const text = (evt.target?.result as string) || '';
        const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        if (lines.length < 2) {
          setImportErrors(['الملف فارغ أو لا يحتوي على صفوف بيانات بعد الترويسة']);
          return;
        }

        const parseCsvLine = (line: string): string[] => {
          const res: string[] = [];
          let cur = '';
          let inQuotes = false;
          for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
              if (inQuotes && line[i + 1] === '"') {
                cur += '"';
                i++;
              } else {
                inQuotes = !inQuotes;
              }
            } else if (ch === ',' && !inQuotes) {
              res.push(cur.trim());
              cur = '';
            } else {
              cur += ch;
            }
          }
          res.push(cur.trim());
          return res;
        };

        const rowsData: any[] = [];
        const errs: string[] = [];

        for (let idx = 1; idx < lines.length; idx++) {
          const cols = parseCsvLine(lines[idx]);
          if (cols.length < 2 || !cols.some(Boolean)) continue;
          const code = cols[0] || `SRV-${Date.now()}-${idx}`;
          const nameAr = cols[1];
          if (!nameAr) {
            errs.push(`السطر ${idx + 1}: اسم الخدمة بالعربية مطلوب`);
            continue;
          }
          const nameEn = cols[2] || '';
          const categoryRaw = cols[3] || 'SOFTWARE_DEVELOPMENT';
          const billingBasisRaw = cols[4] || 'DAILY';
          const unitPrice = parseFloat(cols[5]) || 0;
          const currency = cols[6] || 'SAR';
          const vat = parseFloat(cols[7]) || 15;
          const gl = cols[8] || '40101';

          rowsData.push({
            id: `srv-${Date.now()}-${idx}`,
            code,
            nameAr,
            nameEn,
            category: Object.keys(CATEGORY_LABELS).includes(categoryRaw) ? categoryRaw : 'SOFTWARE_DEVELOPMENT',
            billingBasis: Object.keys(BILLING_BASIS_LABELS).includes(billingBasisRaw) ? billingBasisRaw : 'DAILY',
            defaultUnitPrice: unitPrice,
            currencyCode: currency,
            vatRate: vat,
            glAccountId: gl,
            isActive: true,
          });
        }

        setParsedRows(rowsData);
        setImportErrors(errs);
      } catch (err: any) {
        setImportErrors([`فشل قراءة الملف: ${err.message}`]);
      }
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleExecuteImport = () => {
    if (parsedRows.length === 0) return;
    setImporting(true);
    try {
      const currentList: ServiceItem[] = query.data || INITIAL_SERVICES;
      const combined = [...parsedRows, ...currentList];
      localStorage.setItem('azm_services_catalog', JSON.stringify(combined));
      qc.invalidateQueries({ queryKey: ['/services/catalog'] });
      toast.success(`تم استيراد ${parsedRows.length} خدمة إلى المخزون بنجاح`);
      setImportOpen(false);
      setImportFile(null);
      setParsedRows([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: any) {
      toast.error('حدث خطأ أثناء حفظ الخدمات المستوردة');
    } finally {
      setImporting(false);
    }
  };

  const downloadSampleCsv = () => {
    const sampleHeaders = ['رمز الخدمة', 'اسم الخدمة بالعربية', 'اسم الخدمة بالإنجليزية', 'التصنيف', 'أساس الفوترة', 'السعر القياسي', 'العملة', 'نسبة الضريبة', 'حساب الإيراد'];
    const sampleRows = [
      ['SRV-DEV-01', 'تأجير مهندس برمجيات أول', 'Senior Full-Stack Engineer', 'SOFTWARE_DEVELOPMENT', 'DAILY', '1500', 'SAR', '15', '40101'],
      ['SRV-CLD-02', 'استشارات بنية تحتية سحابية', 'Cloud Infrastructure Consulting', 'CLOUD_DEVOPS', 'HOURLY', '350', 'SAR', '15', '40101'],
    ];
    const csv = '\uFEFF' + [sampleHeaders.join(','), ...sampleRows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'نموذج_استيراد_المخزون_الخدمي.csv';
    a.click();
  };

  const openAdd = () => {
    setFormData({
      code: `SRV-${String(Math.floor(Math.random() * 900) + 100)}`,
      nameAr: '',
      nameEn: '',
      category: 'SOFTWARE_DEVELOPMENT',
      billingBasis: 'DAILY',
      defaultUnitPrice: '',
      currencyCode: 'SAR',
      vatRate: 15,
      glAccountId: '40101',
      description: '',
      isActive: true,
    });
    setIsAdding(true);
  };

  const openEdit = (item: ServiceItem) => {
    setFormData({ ...item });
    setEditingService(item);
  };

  // Save Mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!formData.nameAr?.trim()) throw new Error('اسم الخدمة بالعربية مطلوب');
      if (!formData.code?.trim()) throw new Error('رمز الخدمة مطلوب');
      if (formData.defaultUnitPrice === '' || Number(formData.defaultUnitPrice) < 0) {
        throw new Error('السعر القياسي للخدمة مطلوب ويجب أن يكون رقماً موجباً');
      }

      const currentList: ServiceItem[] = query.data || INITIAL_SERVICES;
      let updated: ServiceItem[];

      if (editingService) {
        updated = currentList.map((s) =>
          s.id === editingService.id
            ? ({
                ...s,
                ...formData,
                defaultUnitPrice: Number(formData.defaultUnitPrice),
                vatRate: Number(formData.vatRate || 15),
                updatedAt: new Date().toISOString(),
              } as ServiceItem)
            : s
        );
      } else {
        const newItem: ServiceItem = {
          ...(formData as ServiceItem),
          id: `srv-${Date.now()}`,
          defaultUnitPrice: Number(formData.defaultUnitPrice),
          vatRate: Number(formData.vatRate || 15),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        updated = [newItem, ...currentList];
      }

      localStorage.setItem('azm_services_catalog', JSON.stringify(updated));
      try {
        if (editingService) {
          await api.patch(`/services/catalog/${editingService.id}`, formData);
        } else {
          await api.post('/services/catalog', formData);
        }
      } catch {
        // Local persistence handled
      }
      return updated;
    },
    onSuccess: () => {
      toast.success(editingService ? 'تم تعديل الخدمة بنجاح' : 'تمت إضافة الخدمة إلى المخزون بنجاح');
      setIsAdding(false);
      setEditingService(null);
      qc.invalidateQueries({ queryKey: ['/services/catalog'] });
    },
    onError: (err: any) => {
      toast.error(err?.message || 'حدث خطأ أثناء حفظ الخدمة');
    },
  });

  // Delete Mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const currentList: ServiceItem[] = query.data || INITIAL_SERVICES;
      const updated = currentList.filter((s) => s.id !== id);
      localStorage.setItem('azm_services_catalog', JSON.stringify(updated));
      try {
        await api.del(`/services/catalog/${id}`);
      } catch {
        // Local fallback
      }
      return updated;
    },
    onSuccess: () => {
      toast.success('تم حذف الخدمة من المخزون بنجاح');
      qc.invalidateQueries({ queryKey: ['/services/catalog'] });
    },
    onError: (err: any) => {
      toast.error(err?.message || 'تعذر حذف الخدمة');
    },
  });

  const handleDelete = (item: ServiceItem) => {
    if (confirm(`هل أنت متأكد من حذف الخدمة "${item.nameAr}" من المخزون الخدمي؟`)) {
      deleteMutation.mutate(item.id);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Official Print Header (Only visible on print) ───────────────────── */}
      <div className="print-only mb-6 border-b-2 border-slate-900 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black text-slate-900">{company?.nameAr}</h1>
            <div className="text-xs text-slate-600 font-mono">
              دليل المخزون الخدمي والخدمات المهنية والتقنية المقدمة للعملاء
            </div>
          </div>
          <div className="text-end">
            <div className="text-base font-bold text-slate-900">المخزون الخدمي (Service Catalog)</div>
            <div className="text-xs text-slate-500 font-mono">تاريخ الطباعة: {today()}</div>
          </div>
        </div>
      </div>

      {/* ── Page Header & Launchpad Actions ─────────────────────────────────── */}
      <PageHeader
        title="المخزون الخدمي — دليل الخدمات والكوادر المقدمة"
        subtitle="دليل الخدمات التقنية والاستشارية وتأجير الكوادر المتاحة للمشاريع وعقود العملاء، مع أسس الفوترة والأسعار القياسية ونسب الضريبة (ZATCA)."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ExportMenu
              title="دليل المخزون الخدمي والخدمات"
              filename={`دليل_المخزون_الخدمي_${today()}`}
              columns={[
                { key: 'code', header: 'رمز الخدمة' },
                { key: 'nameAr', header: 'اسم الخدمة بالعربية' },
                { key: 'nameEn', header: 'اسم الخدمة بالإنجليزية' },
                { key: 'categoryLabel', header: 'التصنيف' },
                { key: 'billingBasisLabel', header: 'أساس الفوترة' },
                { key: 'defaultUnitPrice', header: 'السعر القياسي', type: 'currency' },
                { key: 'currencyCode', header: 'العملة' },
                { key: 'vatRate', header: 'نسبة الضريبة %' },
                { key: 'glAccountId', header: 'حساب الإيراد' },
                { key: 'statusLabel', header: 'الحالة' },
              ]}
              data={(query.data || INITIAL_SERVICES).map((s) => ({
                ...s,
                categoryLabel: CATEGORY_LABELS[s.category]?.label || s.category,
                billingBasisLabel: BILLING_BASIS_LABELS[s.billingBasis] || s.billingBasis,
                statusLabel: s.isActive ? 'نشط' : 'معطل',
              }))}
            />
            <button
              className="btn-secondary text-xs flex items-center gap-1.5 shadow-xs"
              onClick={() => setImportOpen(true)}
              title="استيراد خدمات من ملف CSV"
            >
              <Upload className="size-3.5 text-cyan-600 dark:text-cyan-400" /> استيراد CSV
            </button>
            <button
              className="btn-secondary text-xs flex items-center gap-1.5 shadow-xs"
              onClick={() => window.print()}
              title="طباعة الدليل"
            >
              <Printer className="size-3.5" /> طباعة
            </button>
            <button
              className="btn-primary text-xs flex items-center gap-1.5 shadow-xs"
              onClick={openAdd}
            >
              <Plus className="size-4" /> إضافة خدمة جديدة
            </button>
          </div>
        }
      />

      {/* ── Filter Bar & Metrics ────────────────────────────────────────────── */}
      <div className="card p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative w-full max-w-sm">
            <Search className="absolute start-3 top-3 size-4 text-slate-400" />
            <input
              type="text"
              className="input ps-9 h-9.5 text-xs"
              placeholder="بحث برمز الخدمة أو الاسم أو الوصف…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                className="absolute end-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                onClick={() => setSearch('')}
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          {/* Category Filter Chips */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <button
              className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
                filterCategory === 'ALL'
                  ? 'bg-brand-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
              }`}
              onClick={() => setFilterCategory('ALL')}
            >
              جميع الخدمات ({query.data?.length || 0})
            </button>
            {Object.entries(CATEGORY_LABELS).map(([catKey, catVal]) => {
              const count = (query.data || []).filter((s) => s.category === catKey).length;
              return (
                <button
                  key={catKey}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
                    filterCategory === catKey
                      ? 'bg-brand-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                  onClick={() => setFilterCategory(catKey)}
                >
                  {catVal.label} ({count})
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Services Table ─────────────────────────────────────────────────── */}
      <div className="card overflow-hidden">
        {query.isLoading ? (
          <Loading />
        ) : query.error ? (
          <ErrorState error={query.error} />
        ) : services.length === 0 ? (
          <EmptyState
            text={search ? 'لا توجد خدمات مطابقة لبحثك في المخزون' : 'لا توجد خدمات مسجلة في المخزون الخدمي حتى الآن.'}
            action={
              !search && (
                <button className="btn-primary" onClick={openAdd}>
                  <Plus className="size-4" /> إضافة أول خدمة
                </button>
              )
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table text-xs">
              <thead>
                <tr>
                  <th className="w-24">رمز الخدمة</th>
                  <th>اسم الخدمة المقدمة</th>
                  <th>التصنيف</th>
                  <th>أساس الفوترة</th>
                  <th>السعر القياسي</th>
                  <th>ضريبة ZATCA</th>
                  <th>حساب الإيراد</th>
                  <th className="w-20 text-center">الحالة</th>
                  <th className="w-36 text-end print:hidden">الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {services.map((item) => {
                  const cat = CATEGORY_LABELS[item.category] || { label: item.category, color: 'slate' };
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-900/40 transition">
                      <td className="font-mono font-bold text-brand-700 dark:text-brand-400">
                        {item.code}
                      </td>
                      <td>
                        <div className="font-bold text-slate-900 dark:text-slate-100">
                          {item.nameAr}
                        </div>
                        {item.nameEn && (
                          <div className="text-[11px] text-slate-400 font-sans" dir="ltr">
                            {item.nameEn}
                          </div>
                        )}
                      </td>
                      <td>
                        <Badge color={cat.color}>{cat.label}</Badge>
                      </td>
                      <td>
                        <span className="font-medium text-slate-700 dark:text-slate-300">
                          {BILLING_BASIS_LABELS[item.billingBasis] || item.billingBasis}
                        </span>
                      </td>
                      <td>
                        <div className="font-mono font-black text-slate-900 dark:text-white">
                          {money(item.defaultUnitPrice)} {item.currencyCode}
                        </div>
                      </td>
                      <td>
                        <span className="inline-flex items-center gap-1 font-mono text-emerald-700 dark:text-emerald-400 font-bold">
                          {item.vatRate}%
                        </span>
                      </td>
                      <td>
                        <span className="font-mono text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                          {item.glAccountId || '40101'}
                        </span>
                      </td>
                      <td className="text-center">
                        {item.isActive ? (
                          <Badge color="green">نشط</Badge>
                        ) : (
                          <Badge color="slate">معطل</Badge>
                        )}
                      </td>
                      <td className="text-end print:hidden" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {/* 1. View Button */}
                          <button
                            className="btn-ghost size-7 p-0 text-slate-500 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-950/40"
                            title="معاينة تفاصيل الخدمة"
                            onClick={() => setViewingService(item)}
                          >
                            <Eye className="size-3.5" />
                          </button>
                          {/* 2. Edit Button */}
                          <button
                            className="btn-ghost size-7 p-0 text-slate-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40"
                            title="تعديل الخدمة"
                            onClick={() => openEdit(item)}
                          >
                            <Pencil className="size-3.5" />
                          </button>
                          {/* 3. Delete Button */}
                          <button
                            className="btn-ghost size-7 p-0 text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                            title="حذف الخدمة"
                            onClick={() => handleDelete(item)}
                          >
                            <Trash2 className="size-3.5" />
                          </button>
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

      {/* ── Slide-Over Modal / Drawer (Right Side) for Add / Edit ───────────── */}
      <Drawer
        open={isAdding || !!editingService}
        onClose={() => {
          setIsAdding(false);
          setEditingService(null);
        }}
        title={editingService ? `تعديل الخدمة: ${editingService.code}` : 'إضافة خدمة جديدة إلى المخزون الخدمي'}
        wide
        footer={
          <>
            <button
              className="btn-secondary"
              onClick={() => {
                setIsAdding(false);
                setEditingService(null);
              }}
            >
              إلغاء
            </button>
            <button
              className="btn-primary"
              disabled={saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending && <Spinner />} حفظ الخدمة
            </button>
          </>
        }
      >
        <div className="space-y-4 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="رمز الخدمة (Service Code) *">
              <input
                type="text"
                className="input font-mono"
                dir="ltr"
                placeholder="مثال: SRV-DEV-01"
                value={formData.code || ''}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
              />
            </Field>

            <Field label="تصنيف الخدمة *">
              <select
                className="input"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value as any })}
              >
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="اسم الخدمة بالعربية *" className="col-span-1 md:col-span-2">
              <input
                type="text"
                className="input"
                placeholder="مثال: تأجير مهندس برمجيات متقدم (Senior Full-Stack)"
                value={formData.nameAr || ''}
                onChange={(e) => setFormData({ ...formData, nameAr: e.target.value })}
              />
            </Field>

            <Field label="اسم الخدمة بالإنجليزية" className="col-span-1 md:col-span-2">
              <input
                type="text"
                className="input"
                dir="ltr"
                placeholder="e.g. Senior Full-Stack Engineer Staffing"
                value={formData.nameEn || ''}
                onChange={(e) => setFormData({ ...formData, nameEn: e.target.value })}
              />
            </Field>

            <Field label="أساس الفوترة للعميل *">
              <select
                className="input"
                value={formData.billingBasis}
                onChange={(e) => setFormData({ ...formData, billingBasis: e.target.value as any })}
              >
                {Object.entries(BILLING_BASIS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="السعر القياسي / الفوترة *">
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  className="input font-mono"
                  dir="ltr"
                  placeholder="0.00"
                  value={formData.defaultUnitPrice ?? ''}
                  onChange={(e) => setFormData({ ...formData, defaultUnitPrice: e.target.value })}
                />
              </div>
            </Field>

            <Field label="العملة *">
              <select
                className="input"
                value={formData.currencyCode}
                onChange={(e) => setFormData({ ...formData, currencyCode: e.target.value as any })}
              >
                <option value="SAR">ريال سعودي (SAR)</option>
                <option value="EGP">جنيه مصري (EGP)</option>
                <option value="USD">دولار أمريكي (USD)</option>
              </select>
            </Field>

            <Field label="نسبة ضريبة القيمة المضافة (ZATCA) *">
              <select
                className="input font-mono"
                value={formData.vatRate}
                onChange={(e) => setFormData({ ...formData, vatRate: Number(e.target.value) })}
              >
                <option value={15}>15% (المملكة العربية السعودية - ZATCA)</option>
                <option value={14}>14% (جمهورية مصر العربية)</option>
                <option value={0}>0% (معفى من الضريبة)</option>
              </select>
            </Field>

            <Field label="حساب الإيراد بدفتر الأستاذ العام (GL Account)">
              <input
                type="text"
                className="input font-mono"
                placeholder="40101 — إيرادات عقود وتطوير البرمجيات"
                value={formData.glAccountId || '40101'}
                onChange={(e) => setFormData({ ...formData, glAccountId: e.target.value })}
              />
            </Field>

            <Field label="حالة الخدمة">
              <label className="flex h-9 items-center gap-2 cursor-pointer font-bold">
                <input
                  type="checkbox"
                  className="size-4 rounded text-brand-600 focus:ring-brand-500"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                />
                <span>خدمة نشطة ومتاحة للتعاقد والفوترة</span>
              </label>
            </Field>

            <Field label="وصف نطاق الخدمة وشروط التسليم" className="col-span-1 md:col-span-2">
              <textarea
                className="input h-24 py-2"
                placeholder="اكتب وصفاً مفصلاً لنطاق الخدمة المقدمة والمهارات المشمولة..."
                value={formData.description || ''}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </Field>
          </div>
        </div>
      </Drawer>

      {/* ── Slide-Over Modal / Drawer (Right Side) for Viewing Service Details ─── */}
      <Drawer
        open={!!viewingService}
        onClose={() => setViewingService(null)}
        title={`معاينة الخدمة: ${viewingService?.nameAr || ''}`}
        wide
        footer={
          <div className="flex items-center justify-between w-full">
            <button
              className="btn-secondary text-xs"
              onClick={() => window.print()}
            >
              <Printer className="size-3.5" /> طباعة بطاقة الخدمة
            </button>
            <div className="flex gap-2">
              <button
                className="btn-primary text-xs"
                onClick={() => {
                  const s = viewingService!;
                  setViewingService(null);
                  openEdit(s);
                }}
              >
                <Pencil className="size-3.5" /> تعديل بيانات الخدمة
              </button>
              <button
                className="btn-secondary text-xs"
                onClick={() => setViewingService(null)}
              >
                إغلاق
              </button>
            </div>
          </div>
        }
      >
        {viewingService && (
          <div className="space-y-6 text-xs animate-fade-in">
            {/* Header Badge Card */}
            <div className="card cyber-card-cyan p-5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm font-extrabold text-cyan-700 dark:text-cyan-400">
                  {viewingService.code}
                </span>
                <Badge color={viewingService.isActive ? 'green' : 'slate'}>
                  {viewingService.isActive ? 'نشط ومتاح' : 'معطل مؤقتاً'}
                </Badge>
              </div>
              <h3 className="mt-2 text-lg font-black text-slate-900 dark:text-white">{viewingService.nameAr}</h3>
              {viewingService.nameEn && (
                <div className="text-xs text-slate-500 dark:text-slate-400 font-sans mt-0.5" dir="ltr">
                  {viewingService.nameEn}
                </div>
              )}
            </div>

            {/* Specifications Grid */}
            <div className="card grid grid-cols-2 gap-4 p-5 md:grid-cols-3">
              <div>
                <div className="text-slate-400">التصنيف الوظيفي</div>
                <div className="mt-1 font-bold text-slate-800 dark:text-slate-200">
                  {CATEGORY_LABELS[viewingService.category]?.label || viewingService.category}
                </div>
              </div>

              <div>
                <div className="text-slate-400">أساس التسعير والفوترة</div>
                <div className="mt-1 font-bold text-slate-800 dark:text-slate-200">
                  {BILLING_BASIS_LABELS[viewingService.billingBasis] || viewingService.billingBasis}
                </div>
              </div>

              <div>
                <div className="text-slate-400">السعر القياسي</div>
                <div className="mt-1 font-mono text-base font-black text-emerald-700 dark:text-emerald-400">
                  {money(viewingService.defaultUnitPrice)} {viewingService.currencyCode}
                </div>
              </div>

              <div>
                <div className="text-slate-400">ضريبة القيمة المضافة</div>
                <div className="mt-1 font-mono font-bold text-slate-800 dark:text-slate-200">
                  %{viewingService.vatRate} (ZATCA)
                </div>
              </div>

              <div>
                <div className="text-slate-400">حساب الإيراد بالدليل المحاسبي</div>
                <div className="mt-1 font-mono font-bold text-brand-600 dark:text-brand-400">
                  {viewingService.glAccountId || '40101'}
                </div>
              </div>

              <div>
                <div className="text-slate-400">إجمالي السعر شاملاً الضريبة</div>
                <div className="mt-1 font-mono font-bold text-slate-800 dark:text-slate-200">
                  {money(
                    Number(viewingService.defaultUnitPrice) * (1 + Number(viewingService.vatRate) / 100)
                  )}{' '}
                  {viewingService.currencyCode}
                </div>
              </div>
            </div>

            {/* Description */}
            <div className="card p-5 space-y-2">
              <h4 className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Tag className="size-4 text-brand-600" />
                <span>نطاق الخدمة والمواصفات التعاقدية</span>
              </h4>
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed text-xs">
                {viewingService.description || 'لا يوجد وصف تفصيلي مسجل لهذه الخدمة.'}
              </p>
            </div>
          </div>
        )}
      </Drawer>

      {/* ── CSV Import Modal ─── */}
      <Modal
        open={importOpen}
        onClose={() => {
          setImportOpen(false);
          setImportFile(null);
          setParsedRows([]);
          setImportErrors([]);
        }}
        title="استيراد خدمات جديدة إلى المخزون من ملف CSV"
        wide
        footer={
          <div className="flex flex-wrap items-center justify-between w-full text-xs">
            <button
              type="button"
              className="btn-secondary flex items-center gap-1.5"
              onClick={downloadSampleCsv}
            >
              <FileSpreadsheet className="size-3.5 text-emerald-600" /> تحميل نموذج CSV استرشادي
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setImportOpen(false);
                  setImportFile(null);
                  setParsedRows([]);
                }}
              >
                إلغاء
              </button>
              <button
                type="button"
                className="btn-primary flex items-center gap-1.5"
                disabled={parsedRows.length === 0 || importing}
                onClick={handleExecuteImport}
              >
                {importing && <Spinner />}
                <span>تأكيد واستيراد ({parsedRows.length}) خدمة</span>
              </button>
            </div>
          </div>
        }
      >
        <div className="space-y-5 text-xs">
          {/* File Dropzone */}
          <div className="rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 p-6 text-center hover:border-cyan-500 transition-colors bg-slate-50/50 dark:bg-slate-900/50">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              id="services-csv-input"
              onChange={handleFileChange}
            />
            <label
              htmlFor="services-csv-input"
              className="flex flex-col items-center justify-center gap-2 cursor-pointer"
            >
              <div className="flex size-12 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
                <FileUp className="size-6" />
              </div>
              <div className="font-bold text-sm text-slate-800 dark:text-white">
                {importFile ? importFile.name : 'اضغط هنا لاختيار ملف CSV أو اسحب الملف وأفلته'}
              </div>
              <p className="text-slate-400 text-xs">
                يدعم الملفات المشفرة بصيغة UTF-8 مع الأعمدة: رمز الخدمة، الاسم بالعربية، الاسم بالإنجليزية، التصنيف، أساس الفوترة، السعر، العملة، الضريبة
              </p>
            </label>
          </div>

          {/* Error List */}
          {importErrors.length > 0 && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300 space-y-1">
              <div className="flex items-center gap-1.5 font-bold">
                <AlertTriangle className="size-4" /> تنبيهات أثناء قراءة الملف:
              </div>
              <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                {importErrors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Preview Table */}
          {parsedRows.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-bold text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="size-4" />
                  <span>تم فحص وتحليل {parsedRows.length} خدمة جاهزة للاستيراد:</span>
                </div>
                <span className="text-slate-400 text-[11px]">معاينة الصفوف الخمسة الأولى</span>
              </div>

              <div className="table-container max-h-56 overflow-y-auto custom-scrollbar">
                <table className="table text-xs">
                  <thead>
                    <tr>
                      <th>رمز الخدمة</th>
                      <th>الاسم بالعربية</th>
                      <th>الاسم بالإنجليزية</th>
                      <th>أساس الفوترة</th>
                      <th>السعر القياسي</th>
                      <th>الضريبة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedRows.slice(0, 5).map((r, idx) => (
                      <tr key={idx}>
                        <td className="font-mono font-bold text-cyan-600">{r.code}</td>
                        <td className="font-semibold text-slate-800 dark:text-white">{r.nameAr}</td>
                        <td className="text-slate-500 font-mono text-[11px]" dir="ltr">{r.nameEn || '—'}</td>
                        <td>{BILLING_BASIS_LABELS[r.billingBasis] || r.billingBasis}</td>
                        <td className="font-mono font-bold">{money(r.defaultUnitPrice)} {r.currencyCode}</td>
                        <td className="font-mono">{r.vatRate}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
