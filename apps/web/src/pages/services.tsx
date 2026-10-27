import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Download, Eye, Pencil, Plus, Printer, Search, Tag, Trash2, X,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { money, today } from '../lib/format';
import {
  Badge, Drawer, EmptyState, ErrorState, Field, Loading, PageHeader, Spinner, useToast,
} from '../components/ui';

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

const INITIAL_SERVICES: ServiceItem[] = [
  {
    id: 'srv-001',
    code: 'SRV-DEV-01',
    nameAr: 'تأجير مهندس برمجيات متقدم (Senior Full-Stack Engineer)',
    nameEn: 'Senior Full-Stack Software Engineer Outsourcing',
    category: 'SOFTWARE_DEVELOPMENT',
    billingBasis: 'DAILY',
    defaultUnitPrice: 2500,
    currencyCode: 'SAR',
    vatRate: 15,
    glAccountId: '40101',
    description: 'توفير كادر تقني خبير في تطوير تطبيقات الويب والسحابة بنظام التعاقد اليومي المرن.',
    isActive: true,
  },
  {
    id: 'srv-002',
    code: 'SRV-ARCH-01',
    nameAr: 'استشارات بنية النظم السحابية (Cloud Solutions Architect)',
    nameEn: 'Cloud Architecture & Solutions Design',
    category: 'CLOUD_DEVOPS',
    billingBasis: 'DAILY',
    defaultUnitPrice: 3500,
    currencyCode: 'SAR',
    vatRate: 15,
    glAccountId: '40101',
    description: 'تصميم وبناء البنى التحتية السحابية عالية التوافر ومطابقة لمعايير الأمن السيبراني.',
    isActive: true,
  },
  {
    id: 'srv-003',
    code: 'SRV-ACC-01',
    nameAr: 'تأجير محاسب مالي أول (Senior Financial Accountant)',
    nameEn: 'Senior Financial Accountant Outsourcing',
    category: 'ACCOUNTING_FINANCE',
    billingBasis: 'MONTHLY',
    defaultUnitPrice: 18000,
    currencyCode: 'SAR',
    vatRate: 15,
    glAccountId: '40101',
    description: 'تأجير كوادر محاسبية مؤهلة لإدارة الدفاتر المحاسبية وإقرارات الزكاة والضريبة.',
    isActive: true,
  },
  {
    id: 'srv-004',
    code: 'SRV-ZATCA-01',
    nameAr: 'باقة الربط والتكامل المباشر مع هيئة الزكاة (ZATCA Phase 2)',
    nameEn: 'ZATCA Phase 2 E-Invoicing Integration Package',
    category: 'TECHNICAL_CONSULTING',
    billingBasis: 'FIXED',
    defaultUnitPrice: 25000,
    currencyCode: 'SAR',
    vatRate: 15,
    glAccountId: '40101',
    description: 'تهيئة وربط الحل التقني وإصدار أختام التشفير الرقمية (CSID) والاعتماد الحي مع منصة فاتورة.',
    isActive: true,
  },
];

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
      localStorage.setItem('azm_services_catalog', JSON.stringify(INITIAL_SERVICES));
      return INITIAL_SERVICES;
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

  const exportCsv = () => {
    const headers = ['رمز الخدمة', 'اسم الخدمة بالعربية', 'الاسم بالإنجليزية', 'التصنيف', 'أساس الفوترة', 'السعر القياسي', 'العملة', 'نسبة الضريبة', 'حساب الإيراد', 'الحالة'];
    const rows = services.map((s) => [
      s.code,
      `"${s.nameAr.replace(/"/g, '""')}"`,
      `"${(s.nameEn || '').replace(/"/g, '""')}"`,
      CATEGORY_LABELS[s.category]?.label || s.category,
      BILLING_BASIS_LABELS[s.billingBasis] || s.billingBasis,
      s.defaultUnitPrice,
      s.currencyCode,
      `${s.vatRate}%`,
      s.glAccountId || '40101',
      s.isActive ? 'نشط' : 'معطل',
    ]);
    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `دليل_المخزون_الخدمي_${today()}.csv`;
    a.click();
    toast.success('تم تصدير دليل المخزون الخدمي إلى ملف CSV بنجاح');
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
            <button
              className="btn-secondary text-xs flex items-center gap-1.5 shadow-xs"
              onClick={() => window.print()}
              title="طباعة الدليل"
            >
              <Printer className="size-3.5" /> طباعة
            </button>
            <button
              className="btn-secondary text-xs flex items-center gap-1.5 shadow-xs"
              onClick={exportCsv}
              title="تصدير CSV"
            >
              <Download className="size-3.5" /> تصدير Excel/CSV
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
            <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-indigo-950 p-6 text-white shadow-lg border border-brand-800/40">
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm font-bold text-brand-300">
                  {viewingService.code}
                </span>
                <Badge color={viewingService.isActive ? 'green' : 'slate'}>
                  {viewingService.isActive ? 'نشط ومتاح' : 'معطل مؤقتاً'}
                </Badge>
              </div>
              <h3 className="mt-2 text-lg font-black text-white">{viewingService.nameAr}</h3>
              {viewingService.nameEn && (
                <div className="text-xs text-slate-300 font-sans" dir="ltr">
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
    </div>
  );
}
