import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Decimal from 'decimal.js';
import {
  CheckCircle2, ChevronDown, ChevronLeft, Download, Eye, FileCode, FlaskConical,
  Folder, FolderOpen, List, Network, Pencil, Plus, Printer, Send, Trash2, Undo2, XCircle,
} from 'lucide-react';
import { api, Page } from '../lib/api';
import { useBaseCurrency } from '../lib/auth';
import { date, dateTime, downloadCsv, money, today } from '../lib/format';
import { ACCOUNT_CLASS, ACCOUNT_SOURCE, ACCOUNT_SUBTYPE, CASH_FLOW, DIMENSION_POLICY, JE_STATUS, JOURNAL_TYPE, LEDGER } from '../lib/labels';
import { ActiveBadge, CrudPage, fieldErrors, useRefOptions } from '../components/CrudPage';
import { Badge, Drawer, EmptyState, ErrorState, Field, Loading, Modal, PageHeader, Pager, ReasonDialog, Spinner, useToast } from '../components/ui';

export interface Account {
  id: string; parentId: string | null; code: string; nameAr: string; nameEn: string | null; accountClass: string; subtype: string | null;
  normalBalance: string; isContra: boolean; currencyCode: string | null; isPosting: boolean; isControl: boolean; isActive: boolean;
  cashFlowCategory: string | null; requiresCostCenter: boolean; requiresProject: boolean; requiresEmployee: boolean; level: number;
  description: string | null; rowVersion: number; hasTransactions: boolean; hasChildren: boolean;
}

export function useAccounts(postingOnly = false) {
  return useQuery({ queryKey: ['accounts', postingOnly], queryFn: () => api.get<Account[]>('/accounts', postingOnly ? { postingOnly: 'true', activeOnly: 'true' } : {}) });
}

/** Searchable account picker (code / name). */
export function AccountSelect({ value, onChange, accounts, className = '' }: { value: string; onChange: (id: string) => void; accounts: Account[]; className?: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const sel = accounts.find((a) => a.id === value);
  const list = useMemo(() => accounts.filter((a) => !q || a.code.includes(q) || a.nameAr.includes(q) || (a.nameEn ?? '').toLowerCase().includes(q.toLowerCase())).slice(0, 60), [accounts, q]);
  return (
    <div className={`relative ${className}`}>
      <button type="button" className="input flex items-center justify-between text-start" onClick={() => setOpen(!open)}>
        <span className="truncate">{sel ? `${sel.code} — ${sel.nameAr}` : <span className="text-slate-400">اختر الحساب…</span>}</span>
        <ChevronDown className="size-4 shrink-0 text-slate-400" />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-[26rem] max-w-[80vw] rounded-lg border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900">
          <input className="input mb-2" autoFocus placeholder="ابحث بالرمز أو الاسم" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setOpen(false)} />
          <div className="max-h-64 overflow-y-auto">
            {list.map((a) => (
              <button type="button" key={a.id} className="flex w-full gap-2 rounded px-2 py-1.5 text-start text-sm hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => { onChange(a.id); setOpen(false); setQ(''); }}>
                <span className="num w-20 shrink-0 text-start text-slate-500">{a.code}</span> {a.nameAr}
              </button>
            ))}
            {list.length === 0 && <div className="p-2 text-center text-xs text-slate-500">لا توجد حسابات تفصيلية مطابقة</div>}
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ chart of accounts
const emptyAccount = { parentId: '', code: '', nameAr: '', nameEn: '', accountClass: 'ASSET', subtype: '', isContra: false, currencyCode: '', isPosting: true, isControl: false, isActive: true, cashFlowCategory: '', requiresCostCenter: false, requiresProject: false, requiresEmployee: false, description: '' };

export function AccountsPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const q = useAccounts();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'TREE' | 'TABLE'>('TREE');
  const [form, setForm] = useState<Record<string, any> | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: () => {
      const f = form!;
      const body: Record<string, any> = {};
      for (const k of Object.keys(emptyAccount)) body[k] = f[k] === '' ? null : f[k];
      return f.id ? api.patch(`/accounts/${f.id}`, { ...body, rowVersion: f.rowVersion }) : api.post('/accounts', body);
    },
    onSuccess: () => { toast.success('تم حفظ الحساب'); setForm(null); qc.invalidateQueries({ queryKey: ['accounts'] }); },
    onError: (e) => { setErrs(fieldErrors(e)); toast.error(e); },
  });
  const del = useMutation({ mutationFn: (id: string) => api.del(`/accounts/${id}`), onSuccess: () => { toast.success('تم الحذف'); qc.invalidateQueries({ queryKey: ['accounts'] }); }, onError: (e) => toast.error(e) });

  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorState error={q.error} />;
  const all = q.data!;
  const hiddenBy = (a: Account): boolean => {
    let p = a.parentId;
    while (p) {
      if (collapsed.has(p)) return true;
      p = all.find((x) => x.id === p)?.parentId ?? null;
    }
    return false;
  };
  const rows = search ? all.filter((a) => a.code.includes(search) || a.nameAr.includes(search)) : all.filter((a) => !hiddenBy(a));
  const headers = all.filter((a) => !a.isPosting);
  const set = (k: string, v: any) => setForm({ ...form!, [k]: v });

  const handleExport = () => {
    downloadCsv(`chart-of-accounts-${today()}.csv`, [
      ['الرمز', 'اسم الحساب بالعربية', 'اسم الحساب بالإنجليزية', 'التصنيف', 'النوع الفرعي', 'الطبيعة', 'العملة', 'حساب تفصيلي', 'حساب رقابي', 'الحالة'],
      ...all.map((a) => [
        a.code, a.nameAr, a.nameEn || '', ACCOUNT_CLASS[a.accountClass] || a.accountClass, a.subtype || '', a.normalBalance, a.currencyCode || 'كل العملات', a.isPosting ? 'نعم' : 'لا', a.isControl ? 'نعم' : 'لا', a.isActive ? 'نشط' : 'معطل',
      ]),
    ]);
    toast.success('تم تصدير شجرة الحسابات إلى ملف CSV بنجاح');
  };

  return (
    <div>
      <PageHeader
        title="شجرة الحسابات المحاسبية المرئية"
        subtitle="الهيكل الدليل المحاسبي العام الموحد. الحسابات التجميعية للتصنيف ولا تقبل الترحيل المباشر."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/* View Mode Toggle */}
            <div className="bg-slate-100 dark:bg-[#080d1a] p-1 rounded-xl flex items-center border border-slate-200/80 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setViewMode('TREE')}
                className={`px-2.5 py-1 rounded-lg text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                  viewMode === 'TREE'
                    ? 'bg-white text-cyan-700 shadow-2xs dark:bg-slate-800 dark:text-amber-400'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                <Network className="size-3.5" /> الشجرة المرئية
              </button>
              <button
                type="button"
                onClick={() => setViewMode('TABLE')}
                className={`px-2.5 py-1 rounded-lg text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                  viewMode === 'TABLE'
                    ? 'bg-white text-cyan-700 shadow-2xs dark:bg-slate-800 dark:text-amber-400'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                <List className="size-3.5" /> جدول مسطح
              </button>
            </div>

            <button className="btn-secondary text-xs flex items-center gap-1.5" onClick={() => window.print()} title="طباعة">
              <Printer className="size-3.5" /> طباعة
            </button>
            <button className="btn-secondary text-xs flex items-center gap-1.5" onClick={handleExport} title="تصدير CSV">
              <Download className="size-3.5" /> تصدير Excel/CSV
            </button>
            <button className="btn-primary text-xs flex items-center gap-1.5" onClick={() => { setErrs({}); setForm({ ...emptyAccount }); }}>
              <Plus className="size-4" /> حساب جديد
            </button>
          </div>
        }
      />
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 p-3 dark:border-slate-800 bg-slate-50/70 dark:bg-[#080d1a]">
          <input className="input w-72 text-xs" placeholder="بحث بالرمز أو اسم الحساب…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="flex items-center gap-2">
            <button className="btn-secondary text-xs py-1" onClick={() => setCollapsed(new Set(headers.map((h) => h.id)))}>طي الكل</button>
            <button className="btn-secondary text-xs py-1" onClick={() => setCollapsed(new Set())}>فتح الكل</button>
          </div>
        </div>

        {all.length === 0 ? (
          <EmptyState text="لا توجد حسابات بعد. أنشئ الحسابات الرئيسية (الأصول، الالتزامات، حقوق الملكية، الإيرادات، التكاليف، المصروفات) ثم الحسابات الفرعية." action={<button className="btn-primary" onClick={() => setForm({ ...emptyAccount })}><Plus className="size-4" /> حساب جديد</button>} />
        ) : viewMode === 'TREE' ? (
          /* =========================================================================
             VISUAL TREE VIEW
          ========================================================================= */
          <div className="p-4 space-y-4 max-h-[75vh] overflow-y-auto custom-scrollbar">
            {['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'OPERATING_EXPENSE'].map((accClass) => {
              const rootAccounts = all.filter((a) => a.accountClass === accClass && !a.parentId);
              const classLabel = ACCOUNT_CLASS[accClass] || accClass;
              const classTotal = all.filter((a) => a.accountClass === accClass).length;

              const classColor =
                accClass === 'ASSET' ? 'border-blue-200 bg-blue-50/30 text-blue-900' :
                accClass === 'LIABILITY' ? 'border-amber-200 bg-amber-50/30 text-amber-900' :
                accClass === 'EQUITY' ? 'border-purple-200 bg-purple-50/30 text-purple-900' :
                accClass === 'REVENUE' ? 'border-emerald-200 bg-emerald-50/30 text-emerald-900' :
                'border-rose-200 bg-rose-50/30 text-rose-900';

              return (
                <div key={accClass} className={`rounded-xl border ${classColor} p-3.5 space-y-2`}>
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200/80">
                    <div className="flex items-center gap-2">
                      <FolderOpen className="size-4 text-slate-700" />
                      <span className="font-bold text-sm text-slate-900">{classLabel}</span>
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-600">
                        {classTotal} حساب
                      </span>
                    </div>

                    <button
                      className="btn-ghost h-6 px-2 text-xs flex items-center gap-1"
                      onClick={() => {
                        setErrs({});
                        setForm({ ...emptyAccount, accountClass: accClass, isPosting: false });
                      }}
                    >
                      <Plus className="size-3" /> حساب رئيسي
                    </button>
                  </div>

                  {/* Render Tree Branches Recursively */}
                  <div className="space-y-1.5 pt-1">
                    {rootAccounts.map((root) => (
                      <VisualAccountNode
                        key={root.id}
                        account={root}
                        allAccounts={all}
                        collapsed={collapsed}
                        setCollapsed={setCollapsed}
                        onEdit={(acc) => {
                          setErrs({});
                          setForm({
                            ...emptyAccount,
                            ...acc,
                            parentId: acc.parentId ?? '',
                            subtype: acc.subtype ?? '',
                            currencyCode: acc.currencyCode ?? '',
                            cashFlowCategory: acc.cashFlowCategory ?? '',
                            nameEn: acc.nameEn ?? '',
                            description: acc.description ?? '',
                          });
                        }}
                        onAddChild={(parent) => {
                          setErrs({});
                          setForm({ ...emptyAccount, parentId: parent.id, accountClass: parent.accountClass, isPosting: true });
                        }}
                        onDelete={(id) => confirm('حذف الحساب؟') && del.mutate(id)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* =========================================================================
             FLAT TABLE VIEW
          ========================================================================= */
          <div className="max-h-[70vh] overflow-auto custom-scrollbar">
            <table className="table">
              <thead><tr><th>الرمز</th><th>اسم الحساب</th><th>التصنيف</th><th>النوع الفرعي</th><th>الطبيعة</th><th>العملة</th><th>الأبعاد المطلوبة</th><th>الحالة</th><th /></tr></thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id} className={!a.isPosting ? 'font-semibold' : ''}>
                    <td className="num text-start">{a.code}</td>
                    <td>
                      <div className="flex items-center" style={{ paddingInlineStart: `${(a.level - 1) * 18}px` }}>
                        {a.hasChildren ? (
                          <button className="me-1 text-slate-400" onClick={() => { const s = new Set(collapsed); s.has(a.id) ? s.delete(a.id) : s.add(a.id); setCollapsed(s); }}>
                            {collapsed.has(a.id) ? <ChevronLeft className="size-4" /> : <ChevronDown className="size-4" />}
                          </button>
                        ) : <span className="me-1 inline-block w-4" />}
                        {a.nameAr} {a.isControl && <Badge color="blue">رقابي</Badge>} {a.isContra && <Badge color="amber">مقابل</Badge>}
                      </div>
                    </td>
                    <td>{ACCOUNT_CLASS[a.accountClass]}</td>
                    <td>{a.subtype ? ACCOUNT_SUBTYPE[a.subtype] : '—'}</td>
                    <td>{a.normalBalance === 'DEBIT' ? 'مدين' : 'دائن'}</td>
                    <td>{a.currencyCode ?? 'كل العملات'}</td>
                    <td className="text-xs">{[a.requiresCostCenter && 'مركز تكلفة', a.requiresProject && 'مشروع', a.requiresEmployee && 'موظف'].filter(Boolean).join('، ') || '—'}</td>
                    <td><ActiveBadge v={a.isActive} /></td>
                    <td>
                      <div className="flex justify-end gap-1">
                        {!a.isPosting && <button className="btn-ghost h-7 px-2" title="حساب فرعي" onClick={() => setForm({ ...emptyAccount, parentId: a.id, accountClass: a.accountClass })}><Plus className="size-3.5" /></button>}
                        <Link className="btn-ghost h-7 px-2 text-xs" to={`/reports/account-statement?accountId=${a.id}`}>كشف</Link>
                        <button className="btn-ghost h-7 px-2" onClick={() => { setErrs({}); setForm({ ...emptyAccount, ...a, parentId: a.parentId ?? '', subtype: a.subtype ?? '', currencyCode: a.currencyCode ?? '', cashFlowCategory: a.cashFlowCategory ?? '', nameEn: a.nameEn ?? '', description: a.description ?? '' }); }}><Pencil className="size-3.5" /></button>
                        {!a.hasTransactions && !a.hasChildren && <button className="btn-ghost h-7 px-2 text-rose-600" onClick={() => confirm('حذف الحساب؟') && del.mutate(a.id)}><Trash2 className="size-3.5" /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <Drawer open={!!form} onClose={() => setForm(null)} title={form?.id ? 'تعديل حساب' : 'حساب جديد'}
        footer={<><button className="btn-secondary" onClick={() => setForm(null)}>إلغاء</button><button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending && <Spinner />} حفظ</button></>}>
        {form && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="الحساب الأب" className="col-span-2">
              <select className="input" value={form.parentId} onChange={(e) => { const p = all.find((x) => x.id === e.target.value); setForm({ ...form, parentId: e.target.value, accountClass: p?.accountClass ?? form.accountClass }); }}>
                <option value="">— حساب رئيسي —</option>
                {headers.filter((h) => h.id !== form.id).map((h) => <option key={h.id} value={h.id}>{h.code} — {h.nameAr}</option>)}
              </select>
            </Field>
            <Field label="الرمز *" error={errs.code}><input className="input" dir="ltr" value={form.code} onChange={(e) => set('code', e.target.value)} /></Field>
            <Field label="الاسم بالعربية *" error={errs.nameAr}><input className="input" value={form.nameAr} onChange={(e) => set('nameAr', e.target.value)} /></Field>
            <Field label="الاسم بالإنجليزية"><input className="input" dir="ltr" value={form.nameEn} onChange={(e) => set('nameEn', e.target.value)} /></Field>
            <Field label="التصنيف *"><select className="input" value={form.accountClass} disabled={!!form.parentId || form.hasTransactions} onChange={(e) => set('accountClass', e.target.value)}>{Object.entries(ACCOUNT_CLASS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            <Field label="النوع الفرعي"><select className="input" value={form.subtype} onChange={(e) => set('subtype', e.target.value)}><option value="">—</option>{Object.entries(ACCOUNT_SUBTYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            <Field label="عملة الحساب" hint="فارغ = يقبل كل العملات"><input className="input" dir="ltr" maxLength={3} value={form.currencyCode} onChange={(e) => set('currencyCode', e.target.value.toUpperCase())} /></Field>
            <Field label="تصنيف التدفق النقدي"><select className="input" value={form.cashFlowCategory} onChange={(e) => set('cashFlowCategory', e.target.value)}><option value="">—</option>{Object.entries(CASH_FLOW).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            <div className="col-span-2 grid grid-cols-2 gap-2 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
              {[['isPosting', 'حساب تفصيلي (يقبل الترحيل)'], ['isActive', 'نشط'], ['isControl', 'حساب رقابي (لا يقبل الترحيل اليدوي)'], ['isContra', 'حساب مقابل (عكس الطبيعة)'], ['requiresCostCenter', 'يتطلب مركز تكلفة'], ['requiresProject', 'يتطلب مشروع'], ['requiresEmployee', 'يتطلب موظف']].map(([k, l]) => (
                <label key={k} className="flex items-center gap-2"><input type="checkbox" checked={!!form[k]} onChange={(e) => set(k, e.target.checked)} /> {l}</label>
              ))}
            </div>
            <Field label="الوصف" className="col-span-2"><textarea className="input h-20 py-2" value={form.description} onChange={(e) => set('description', e.target.value)} /></Field>
          </div>
        )}
      </Drawer>
    </div>
  );
}

// ------------------------------------------------------------------ Visual Tree Node Component
function VisualAccountNode({
  account, allAccounts, collapsed, setCollapsed, onEdit, onAddChild, onDelete,
}: {
  account: Account;
  allAccounts: Account[];
  collapsed: Set<string>;
  setCollapsed: (s: Set<string>) => void;
  onEdit: (a: Account) => void;
  onAddChild: (parent: Account) => void;
  onDelete: (id: string) => void;
}) {
  const children = allAccounts.filter((a) => a.parentId === account.id);
  const isCollapsed = collapsed.has(account.id);
  const isParent = children.length > 0 || !account.isPosting;

  const toggle = () => {
    const s = new Set(collapsed);
    if (s.has(account.id)) s.delete(account.id);
    else s.add(account.id);
    setCollapsed(s);
  };

  return (
    <div className="space-y-1">
      <div className={`flex items-center justify-between p-2 rounded-lg transition-all border ${
        isParent
          ? 'bg-white border-slate-200 shadow-xs hover:border-slate-300 font-bold'
          : 'bg-white/70 border-slate-100 hover:bg-white hover:border-slate-200 text-slate-800'
      }`}>
        <div className="flex items-center gap-2">
          {isParent ? (
            <button
              type="button"
              onClick={toggle}
              className="p-1 hover:bg-slate-100 rounded text-slate-500 transition-transform"
            >
              {isCollapsed ? <ChevronLeft className="size-4" /> : <ChevronDown className="size-4" />}
            </button>
          ) : (
            <span className="w-6 inline-block text-center text-slate-300">•</span>
          )}

          {isParent ? (
            isCollapsed ? <Folder className="size-4 text-amber-500 shrink-0" /> : <FolderOpen className="size-4 text-amber-500 shrink-0" />
          ) : (
            <FileCode className="size-4 text-blue-500 shrink-0" />
          )}

          {/* Account Code Pill */}
          <span className="font-mono text-xs px-2 py-0.5 rounded font-black bg-slate-100 text-slate-900 border border-slate-200">
            {account.code}
          </span>

          {/* Account Name */}
          <span className="text-xs font-bold text-slate-900">{account.nameAr}</span>
          {account.nameEn && <span className="text-[11px] text-slate-400 font-mono">({account.nameEn})</span>}

          {/* Badges */}
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
            account.normalBalance === 'DEBIT'
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
          }`}>
            {account.normalBalance === 'DEBIT' ? 'مدين' : 'دائن'}
          </span>

          {account.currencyCode && (
            <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-cyan-50 text-cyan-800 border border-cyan-200">
              {account.currencyCode}
            </span>
          )}

          {account.isControl && <Badge color="blue">رقابي</Badge>}
        </div>

        {/* Quick Actions */}
        <div className="flex items-center gap-1 opacity-80 hover:opacity-100">
          {isParent && (
            <button
              type="button"
              className="btn-ghost h-6 px-1.5 text-xs text-blue-600 hover:bg-blue-50"
              onClick={() => onAddChild(account)}
              title="إضافة حساب فرعي"
            >
              <Plus className="size-3" /> فرعي
            </button>
          )}

          <Link
            className="btn-ghost h-6 px-1.5 text-[11px] text-slate-600 hover:bg-slate-100"
            to={`/reports/account-statement?accountId=${account.id}`}
            title="كشف حساب الأستاذ المساعد"
          >
            كشف
          </Link>

          <button
            type="button"
            className="btn-ghost h-6 px-1.5 text-slate-600 hover:bg-slate-100"
            onClick={() => onEdit(account)}
            title="تعديل"
          >
            <Pencil className="size-3" />
          </button>

          {!account.hasTransactions && !account.hasChildren && (
            <button
              type="button"
              className="btn-ghost h-6 px-1.5 text-rose-600 hover:bg-rose-50"
              onClick={() => onDelete(account.id)}
              title="حذف"
            >
              <Trash2 className="size-3" />
            </button>
          )}
        </div>
      </div>

      {/* Children branches with connector line */}
      {!isCollapsed && children.length > 0 && (
        <div className="ms-4 ps-3 border-r-2 border-slate-200 space-y-1">
          {children.map((child) => (
            <VisualAccountNode
              key={child.id}
              account={child}
              allAccounts={allAccounts}
              collapsed={collapsed}
              setCollapsed={setCollapsed}
              onEdit={onEdit}
              onAddChild={onAddChild}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ bank accounts
export const BanksPage = () => (
  <CrudPage
    title="البنوك والصناديق" path="/bank-accounts" entityLabel="حساب بنكي/صندوق"
    columns={[
      { key: 'code', label: 'الرمز' }, { key: 'name', label: 'الاسم' }, { key: 'kind', label: 'النوع', render: (r) => (r.kind === 'BANK' ? 'بنك' : 'صندوق') },
      { key: 'bankName', label: 'البنك' }, { key: 'currencyCode', label: 'العملة' }, { key: 'isActive', label: 'الحالة', render: (r) => <ActiveBadge v={r.isActive} /> },
    ]}
    fields={[
      { name: 'code', label: 'الرمز', type: 'text', required: true, ltr: true },
      { name: 'name', label: 'الاسم', type: 'text', required: true },
      { name: 'kind', label: 'النوع', type: 'select', required: true, default: 'BANK', options: [{ value: 'BANK', label: 'بنك' }, { value: 'CASH', label: 'صندوق' }] },
      { name: 'currencyCode', label: 'العملة', type: 'ref', required: true, ref: { path: '/company-currencies', label: (c) => `${c.code} — ${c.nameAr}` } },
      { name: 'glAccountId', label: 'حساب الأستاذ العام', type: 'ref', required: true, ref: { path: '/accounts', query: { postingOnly: 'true' }, label: (a) => `${a.code} — ${a.nameAr}` } },
      { name: 'branchId', label: 'الفرع', type: 'ref', ref: { path: '/branches', label: (b) => `${b.code} — ${b.nameAr}` } },
      { name: 'bankName', label: 'اسم البنك', type: 'text' },
      { name: 'accountNumber', label: 'رقم الحساب', type: 'text', ltr: true },
      { name: 'iban', label: 'IBAN', type: 'text', ltr: true },
      { name: 'isActive', label: 'نشط', type: 'bool', default: true },
    ]}
  />
);

// ------------------------------------------------------------------ journal list
export function JournalsPage() {
  const nav = useNavigate();
  const toast = useToast();
  const [f, setF] = useState({ status: '', journalType: '', ledger: '', dateFrom: '', dateTo: '', q: '' });
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ['journals', f, page], queryFn: () => api.get<Page<any>>('/journal-entries', { ...f, page, pageSize: 50, sort: '-entryDate' }) });
  const base = useBaseCurrency();

  const handleExport = () => {
    const list = q.data?.data ?? [];
    downloadCsv(`journal-entries-${today()}.csv`, [
      ['رقم القيد', 'التاريخ', 'الفترة', 'النوع', 'الدفتر', 'الوصف', 'المصدر', `مدين (${base})`, `دائن (${base})`, 'الحالة'],
      ...list.map((e: any) => [
        e.entryNo || '', e.entryDate || '', e.periodName || '', JOURNAL_TYPE[e.journalType] || e.journalType, LEDGER[e.ledger] || e.ledger, e.description || '', `${e.sourceModule}/${e.sourceType}`, e.totalDebitBase, e.totalCreditBase, JE_STATUS[e.status]?.label || e.status,
      ]),
    ]);
    toast.success('تم تصدير القيود اليومية إلى ملف CSV بنجاح');
  };

  return (
    <div>
      <PageHeader
        title="القيود اليومية"
        subtitle="القيد المرحّل لا يعدل ولا يحذف؛ التصحيح يتم بقيد عكسي أو قيد تسوية."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-secondary text-xs flex items-center gap-1.5" onClick={() => window.print()} title="طباعة">
              <Printer className="size-3.5" /> طباعة
            </button>
            <button className="btn-secondary text-xs flex items-center gap-1.5" onClick={handleExport} title="تصدير CSV">
              <Download className="size-3.5" /> تصدير Excel/CSV
            </button>
            <Link className="btn-primary text-xs flex items-center gap-1.5" to="/acc/journals/new">
              <Plus className="size-4" /> قيد يدوي جديد
            </Link>
          </div>
        }
      />
      <div className="card overflow-hidden">
        <div className="flex flex-wrap gap-2 border-b border-slate-200 p-3 dark:border-slate-800">
          <input className="input w-56" placeholder="بحث بالرقم أو الوصف أو المرجع" value={f.q} onChange={(e) => { setF({ ...f, q: e.target.value }); setPage(1); }} />
          <select className="input w-32" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="">كل الحالات</option>{Object.entries(JE_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
          <select className="input w-36" value={f.journalType} onChange={(e) => setF({ ...f, journalType: e.target.value })}><option value="">كل الأنواع</option>{Object.entries(JOURNAL_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <select className="input w-28" value={f.ledger} onChange={(e) => setF({ ...f, ledger: e.target.value })}><option value="">كل الدفاتر</option><option value="FINANCIAL">مالي</option><option value="MANAGEMENT">إداري</option></select>
          <input className="input w-40" type="date" value={f.dateFrom} onChange={(e) => setF({ ...f, dateFrom: e.target.value })} />
          <input className="input w-40" type="date" value={f.dateTo} onChange={(e) => setF({ ...f, dateTo: e.target.value })} />
        </div>
        {q.isLoading ? <Loading /> : q.error ? <div className="p-4"><ErrorState error={q.error} /></div> : q.data!.data.length === 0 ? (
          <EmptyState text="لا توجد قيود بعد." action={<Link className="btn-primary" to="/acc/journals/new"><Plus className="size-4" /> قيد يدوي جديد</Link>} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>رقم القيد</th><th>التاريخ</th><th>الفترة</th><th>النوع</th><th>الدفتر</th><th>الوصف</th><th>المصدر</th><th>مدين ({base})</th><th>دائن ({base})</th><th>الحالة</th>
                    <th className="w-20 text-end">الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {q.data!.data.map((e) => (
                    <tr key={e.id} className="cursor-pointer" onClick={() => nav(`/acc/journals/${e.id}`)}>
                      <td className="num text-start font-medium">{e.entryNo ?? '—'}</td>
                      <td>{date(e.entryDate)}</td><td>{e.periodName}</td><td>{JOURNAL_TYPE[e.journalType] ?? e.journalType}</td><td>{LEDGER[e.ledger]}</td>
                      <td className="max-w-xs truncate">{e.description}</td><td className="text-xs">{e.sourceModule}/{e.sourceType}</td>
                      <td className="num">{money(e.totalDebitBase)}</td><td className="num">{money(e.totalCreditBase)}</td>
                      <td><Badge color={JE_STATUS[e.status].color}>{JE_STATUS[e.status].label}</Badge> {e.reversedById && <Badge color="slate">معكوس</Badge>}</td>
                      <td onClick={(evt) => evt.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          <button
                            className="btn-ghost h-7 px-2 text-slate-600 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-950/40"
                            title="عرض تفاصيل القيد"
                            onClick={() => nav(`/acc/journals/${e.id}`)}
                          >
                            <Eye className="size-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager {...q.data!.meta} onPage={setPage} />
          </>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ journal form
interface LineForm { key: number; accountId: string; debit: string; credit: string; currencyCode: string; exchangeRate: string; costCenterId: string; branchId: string; departmentId: string; projectId: string; employeeId: string; clientId: string; description: string }
let lineSeq = 1;
const newLine = (): LineForm => ({ key: lineSeq++, accountId: '', debit: '', credit: '', currencyCode: '', exchangeRate: '', costCenterId: '', branchId: '', departmentId: '', projectId: '', employeeId: '', clientId: '', description: '' });
const dec = (v: string) => { try { return v.trim() ? new Decimal(v) : new Decimal(0); } catch { return new Decimal(0); } };

export function JournalFormPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const base = useBaseCurrency();
  const accounts = useAccounts(true);
  const costCenters = useRefOptions({ path: '/cost-centers', label: (c) => `${c.code} — ${c.nameAr}` });
  const branches = useRefOptions({ path: '/branches', label: (c) => `${c.code} — ${c.nameAr}` });
  const departments = useRefOptions({ path: '/departments', label: (c) => `${c.code} — ${c.nameAr}` });
  const projects = useRefOptions({ path: '/projects', label: (c) => `${c.code} — ${c.nameAr}` });
  const employees = useRefOptions({ path: '/employees', label: (c) => `${c.code} — ${c.fullNameAr}` });
  const clients = useRefOptions({ path: '/clients', label: (c) => `${c.code} — ${c.nameAr}` });
  const existing = useQuery({ queryKey: ['journal', id], enabled: !!id, queryFn: () => api.get<any>(`/journal-entries/${id}`) });
  const [head, setHead] = useState({ entryDate: today(), journalType: 'GENERAL', description: '', reference: '' });
  const [lines, setLines] = useState<LineForm[]>([newLine(), newLine()]);
  const [showFx, setShowFx] = useState(false);
  const [idemKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
    const e = existing.data;
    if (!e) return;
    setHead({ entryDate: e.entryDate, journalType: e.journalType, description: e.description, reference: e.reference ?? '' });
    setLines(e.lines.map((l: any) => ({ key: lineSeq++, accountId: l.accountId, debit: Number(l.debitTx) ? l.debitTx : '', credit: Number(l.creditTx) ? l.creditTx : '', currencyCode: l.currencyCode === base ? '' : l.currencyCode, exchangeRate: l.currencyCode === base ? '' : l.exchangeRate, costCenterId: l.costCenterId ?? '', branchId: l.branchId ?? '', departmentId: l.departmentId ?? '', projectId: l.projectId ?? '', employeeId: l.employeeId ?? '', clientId: l.clientId ?? '', description: l.description ?? '' })));
    if (e.lines.some((l: any) => l.currencyCode !== base)) setShowFx(true);
  }, [existing.data, base]);

  // live totals (approximate base for foreign lines when a rate is typed)
  const toBase = (l: LineForm, v: string) => (l.currencyCode && l.exchangeRate ? dec(v).times(dec(l.exchangeRate)) : dec(v));
  const totDr = lines.reduce((s, l) => s.plus(toBase(l, l.debit)), new Decimal(0));
  const totCr = lines.reduce((s, l) => s.plus(toBase(l, l.credit)), new Decimal(0));
  const diff = totDr.minus(totCr);

  const save = useMutation({
    mutationFn: async (postAfter: boolean) => {
      const body = {
        ...head,
        reference: head.reference || null,
        lines: lines.filter((l) => l.accountId).map((l) => ({
          accountId: l.accountId, debit: l.debit || null, credit: l.credit || null, currencyCode: l.currencyCode || null, exchangeRate: l.currencyCode ? l.exchangeRate || null : null,
          costCenterId: l.costCenterId || null, branchId: l.branchId || null, departmentId: l.departmentId || null, projectId: l.projectId || null, employeeId: l.employeeId || null, clientId: l.clientId || null, description: l.description || null,
        })),
      };
      const saved = id ? await api.put<any>(`/journal-entries/${id}`, { ...body, rowVersion: existing.data.rowVersion }) : await api.post<any>('/journal-entries', body, { 'Idempotency-Key': idemKey });
      if (postAfter) return api.post<any>(`/journal-entries/${saved.id}/post`);
      return saved;
    },
    onSuccess: (e) => { toast.success(e.status === 'POSTED' ? `تم ترحيل القيد ${e.entryNo}` : 'تم حفظ القيد كمسودة'); qc.invalidateQueries({ queryKey: ['journals'] }); qc.invalidateQueries({ queryKey: ['journal', e.id] }); nav(`/acc/journals/${e.id}`); },
    onError: (e) => toast.error(e),
  });

  if (accounts.isLoading || existing.isLoading) return <Loading />;
  if (existing.data && existing.data.status !== 'DRAFT') return <ErrorState error={new Error('لا يمكن تعديل قيد غير مسودة')} />;
  const upd = (k: number, patch: Partial<LineForm>) => setLines(lines.map((l) => (l.key === k ? { ...l, ...patch } : l)));

  return (
    <div>
      <PageHeader title={id ? `تعديل القيد (مسودة)` : 'قيد يومية يدوي'} subtitle="يمكن حفظ المسودة غير متوازنة، لكن الترحيل يتطلب تساوي المدين والدائن بالعملة الأساسية." />
      <div className="card mb-4 grid grid-cols-4 gap-3 p-4">
        <Field label="تاريخ القيد *"><input className="input" type="date" value={head.entryDate} onChange={(e) => setHead({ ...head, entryDate: e.target.value })} /></Field>
        <Field label="نوع القيد"><select className="input" value={head.journalType} onChange={(e) => setHead({ ...head, journalType: e.target.value })}>{['GENERAL', 'ADJUSTMENT', 'ACCRUAL', 'OPENING'].map((t) => <option key={t} value={t}>{JOURNAL_TYPE[t]}</option>)}</select></Field>
        <Field label="المرجع"><input className="input" value={head.reference} onChange={(e) => setHead({ ...head, reference: e.target.value })} /></Field>
        <div className="flex items-end"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showFx} onChange={(e) => setShowFx(e.target.checked)} /> سطور بعملات أجنبية</label></div>
        <Field label="البيان *" className="col-span-4"><input className="input" value={head.description} onChange={(e) => setHead({ ...head, description: e.target.value })} /></Field>
      </div>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>#</th><th className="min-w-72">الحساب</th><th>مدين</th><th>دائن</th>{showFx && <><th>العملة</th><th>سعر الصرف</th></>}<th>مركز التكلفة</th><th>المشروع</th><th>الموظف</th><th>العميل</th><th>القسم</th><th>الفرع</th><th>البيان</th><th /></tr></thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.key}>
                <td className="num">{i + 1}</td>
                <td><AccountSelect accounts={accounts.data ?? []} value={l.accountId} onChange={(v) => upd(l.key, { accountId: v })} /></td>
                <td><input className="input num w-32" value={l.debit} onChange={(e) => upd(l.key, { debit: e.target.value, credit: e.target.value ? '' : l.credit })} /></td>
                <td><input className="input num w-32" value={l.credit} onChange={(e) => upd(l.key, { credit: e.target.value, debit: e.target.value ? '' : l.debit })} /></td>
                {showFx && <>
                  <td><input className="input w-20" dir="ltr" maxLength={3} placeholder={base} value={l.currencyCode} onChange={(e) => upd(l.key, { currencyCode: e.target.value.toUpperCase() })} /></td>
                  <td><input className="input num w-28" placeholder="تلقائي" disabled={!l.currencyCode} value={l.exchangeRate} onChange={(e) => upd(l.key, { exchangeRate: e.target.value })} /></td>
                </>}
                <td><select className="input w-40" value={l.costCenterId} onChange={(e) => upd(l.key, { costCenterId: e.target.value })}><option value="">—</option>{costCenters.data?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></td>
                <td><select className="input w-52" value={l.projectId} onChange={(e) => upd(l.key, { projectId: e.target.value })}><option value="">—</option>{projects.data?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></td>
                <td><select className="input w-52" value={l.employeeId} onChange={(e) => upd(l.key, { employeeId: e.target.value })}><option value="">—</option>{employees.data?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></td>
                <td><select className="input w-48" value={l.clientId} onChange={(e) => upd(l.key, { clientId: e.target.value })}><option value="">—</option>{clients.data?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></td>
                <td><select className="input w-44" value={l.departmentId} onChange={(e) => upd(l.key, { departmentId: e.target.value })}><option value="">—</option>{departments.data?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></td>
                <td><select className="input w-36" value={l.branchId} onChange={(e) => upd(l.key, { branchId: e.target.value })}><option value="">—</option>{branches.data?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></td>
                <td><input className="input w-44" value={l.description} onChange={(e) => upd(l.key, { description: e.target.value })} /></td>
                <td><button className="btn-ghost h-8 px-2 text-rose-600" disabled={lines.length <= 2} onClick={() => setLines(lines.filter((x) => x.key !== l.key))}><Trash2 className="size-3.5" /></button></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50 font-semibold dark:bg-slate-800/50">
              <td /><td><button className="btn-secondary h-8" onClick={() => setLines([...lines, newLine()])}><Plus className="size-4" /> سطر</button></td>
              <td className="num px-3">{money(totDr.toFixed(4))}</td><td className="num px-3">{money(totCr.toFixed(4))}</td>
              <td colSpan={showFx ? 9 : 7} className="px-3">
                {diff.isZero() && !totDr.isZero() ? <span className="flex items-center gap-1 text-emerald-600"><CheckCircle2 className="size-4" /> القيد متوازن</span> : <span className="flex items-center gap-1 text-rose-600"><XCircle className="size-4" /> الفرق: <span className="num">{money(diff.toFixed(4))}</span></span>}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-secondary" onClick={() => nav(-1)}>إلغاء</button>
        <button className="btn-secondary" disabled={save.isPending || head.description.trim().length < 3} onClick={() => save.mutate(false)}>{save.isPending && <Spinner />} حفظ كمسودة</button>
        <button className="btn-primary" disabled={save.isPending || head.description.trim().length < 3 || !diff.isZero() || totDr.isZero()} onClick={() => save.mutate(true)}><Send className="size-4" /> حفظ وترحيل</button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ journal detail
export function JournalDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['journal', id], queryFn: () => api.get<any>(`/journal-entries/${id}`) });
  const [dialog, setDialog] = useState<'cancel' | 'reverse' | null>(null);
  const [revDate, setRevDate] = useState('');
  const refresh = () => { qc.invalidateQueries({ queryKey: ['journal'] }); qc.invalidateQueries({ queryKey: ['journals'] }); };
  const post = useMutation({ mutationFn: () => api.post<any>(`/journal-entries/${id}/post`), onSuccess: (e) => { toast.success(`تم ترحيل القيد ${e.entryNo}`); refresh(); }, onError: (e) => toast.error(e) });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorState error={q.error} />;
  const e = q.data;
  const st = JE_STATUS[e.status];
  return (
    <div>
      <PageHeader
        title={`قيد ${e.entryNo ?? '(مسودة بدون رقم)'}`}
        subtitle={e.description}
        actions={<>
          <button className="btn-secondary text-xs flex items-center gap-1.5" onClick={() => window.print()} title="طباعة سند القيد">
            <Printer className="size-3.5" /> طباعة السند
          </button>
          {e.status === 'DRAFT' && <>
            <Link className="btn-secondary" to={`/acc/journals/${e.id}/edit`}><Pencil className="size-4" /> تعديل</Link>
            <button className="btn-secondary" onClick={() => setDialog('cancel')}><XCircle className="size-4" /> إلغاء المسودة</button>
            <button className="btn-primary" disabled={post.isPending} onClick={() => post.mutate()}>{post.isPending ? <Spinner /> : <Send className="size-4" />} ترحيل</button>
          </>}
          {e.status === 'POSTED' && !e.reversedById && e.journalType !== 'REVERSAL' && <button className="btn-secondary" onClick={() => { setRevDate(''); setDialog('reverse'); }}><Undo2 className="size-4" /> قيد عكسي</button>}
        </>}
      />
      <div className="card mb-4 grid grid-cols-2 gap-4 p-4 text-sm md:grid-cols-5">
        {[
          ['الحالة', <Badge color={st.color}>{st.label}</Badge>], ['التاريخ', date(e.entryDate)], ['الفترة', e.periodName], ['النوع', JOURNAL_TYPE[e.journalType] ?? e.journalType], ['الدفتر', LEDGER[e.ledger]],
          ['المرجع', e.reference ?? '—'], ['المصدر', `${e.sourceModule} / ${e.sourceType}`], ['حدث الترحيل', e.postingEvent ?? '—'], ['تاريخ الترحيل', dateTime(e.postedAt)], ['أُنشئ في', dateTime(e.createdAt)],
        ].map(([k, v], i) => <div key={i}><div className="text-xs text-slate-500">{k}</div><div className="mt-0.5 font-medium">{v}</div></div>)}
        {e.cancelReason && <div className="col-span-full rounded-lg bg-slate-100 p-2 dark:bg-slate-800">سبب الإلغاء: {e.cancelReason}</div>}
        {e.reversalOfId && <div className="col-span-full">هذا القيد عكس للقيد: <Link className="text-brand-600 underline" to={`/acc/journals/${e.reversalOfId}`}>عرض القيد الأصلي</Link></div>}
        {e.reversedById && <div className="col-span-full">تم عكس هذا القيد: <Link className="text-brand-600 underline" to={`/acc/journals/${e.reversedById}`}>عرض القيد العكسي</Link></div>}
      </div>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>#</th><th>الحساب</th><th>مدين (عملة)</th><th>دائن (عملة)</th><th>العملة</th><th>السعر</th><th>مدين (أساسي)</th><th>دائن (أساسي)</th><th>الأبعاد</th><th>البيان</th></tr></thead>
          <tbody>
            {e.lines.map((l: any) => (
              <tr key={l.lineNo}>
                <td className="num">{l.lineNo}</td>
                <td><Link className="hover:underline" to={`/reports/account-statement?accountId=${l.accountId}`}><span className="num">{l.accountCode}</span> — {l.accountNameAr}</Link></td>
                <td className="num">{money(l.debitTx)}</td><td className="num">{money(l.creditTx)}</td><td>{l.currencyCode}</td><td className="num">{l.exchangeRate}</td>
                <td className="num">{money(l.debitBase)}</td><td className="num">{money(l.creditBase)}</td>
                <td className="text-xs">{[l.branchName, l.departmentName, l.costCenterName].filter(Boolean).join(' / ') || '—'}</td>
                <td className="text-xs">{l.description ?? ''}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr className="bg-slate-50 font-semibold dark:bg-slate-800/50"><td colSpan={6} className="px-3 py-2">الإجمالي</td><td className="num px-3">{money(e.totalDebitBase)}</td><td className="num px-3">{money(e.totalCreditBase)}</td><td colSpan={2} /></tr></tfoot>
        </table>
      </div>
      <div className="mt-3 text-xs text-slate-500"><Link className="underline" to={`/audit/log?entityId=${e.id}`}>عرض سجل التدقيق لهذا القيد</Link></div>

      {/* Signatory Box for Printed Voucher */}
      <div className="print-only mt-12 grid grid-cols-3 gap-8 text-center text-xs">
        <div className="border-t-2 border-slate-900 pt-2 font-bold text-slate-900">
          إعداد المحاسب المسؤول
        </div>
        <div className="border-t-2 border-slate-900 pt-2 font-bold text-slate-900">
          مراجعة التدقيق الداخلي
        </div>
        <div className="border-t-2 border-slate-900 pt-2 font-bold text-slate-900">
          اعتماد الإدارة المالية
        </div>
      </div>
      <ReasonDialog open={dialog === 'cancel'} title="إلغاء المسودة" confirmText="إلغاء القيد" danger onClose={() => setDialog(null)}
        onConfirm={async (reason) => { try { await api.post(`/journal-entries/${id}/cancel`, { reason }); toast.success('تم إلغاء المسودة'); setDialog(null); refresh(); } catch (err) { toast.error(err); } }} />
      <ReasonDialog open={dialog === 'reverse'} title="إنشاء قيد عكسي" confirmText="إنشاء وترحيل القيد العكسي" onClose={() => setDialog(null)}
        extra={<Field label="تاريخ القيد العكسي (اختياري — الافتراضي تاريخ القيد الأصلي)" className="mb-3"><input className="input" type="date" value={revDate} onChange={(x) => setRevDate(x.target.value)} /></Field>}
        onConfirm={async (reason) => { try { const r = await api.post<any>(`/journal-entries/${id}/reverse`, { reason, reversalDate: revDate || null }); toast.success(`تم إنشاء القيد العكسي ${r.entryNo}`); setDialog(null); refresh(); nav(`/acc/journals/${r.id}`); } catch (err) { toast.error(err); } }} />
    </div>
  );
}

// ------------------------------------------------------------------ posting rules
interface RuleLineForm { lineNo: number; side: 'DEBIT' | 'CREDIT'; accountSource: string; accountId: string; amountKey: string; dimensionPolicy: string; descriptionTemplate: string }

export function PostingRulesPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const events = useQuery({ queryKey: ['posting-events'], queryFn: () => api.get<any[]>('/posting-events') });
  const rules = useQuery({ queryKey: ['posting-rules'], queryFn: () => api.get<any[]>('/posting-rules') });
  const accounts = useAccounts(true);
  const [form, setForm] = useState<any | null>(null);
  const [condText, setCondText] = useState('{}');
  const [sim, setSim] = useState<any | null>(null);
  const [simResult, setSimResult] = useState<any | null>(null);
  const ev = events.data?.find((x) => x.code === form?.eventCode);

  const save = useMutation({
    mutationFn: () => {
      let conditions = {};
      try { conditions = JSON.parse(condText || '{}'); } catch { throw new Error('صيغة الشروط غير صحيحة (JSON)'); }
      const body = { name: form.name, ledger: form.ledger, conditions, priority: Number(form.priority), effectiveFrom: form.effectiveFrom, effectiveTo: form.effectiveTo || null, isActive: form.isActive,
        lines: form.lines.map((l: RuleLineForm, i: number) => ({ ...l, lineNo: i + 1, accountId: l.accountId || null, descriptionTemplate: l.descriptionTemplate || null })) };
      return form.id ? api.patch(`/posting-rules/${form.id}`, { ...body, rowVersion: form.rowVersion }) : api.post('/posting-rules', { ...body, eventCode: form.eventCode });
    },
    onSuccess: () => { toast.success('تم حفظ قاعدة الترحيل'); setForm(null); qc.invalidateQueries({ queryKey: ['posting-rules'] }); },
    onError: (e) => toast.error(e),
  });
  const del = useMutation({ mutationFn: (rid: string) => api.del(`/posting-rules/${rid}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['posting-rules'] }), onError: (e) => toast.error(e) });
  const simulate = useMutation({ mutationFn: () => api.post<any>('/posting-rules/simulate', { eventCode: sim.eventCode, entryDate: sim.entryDate, currencyCode: sim.currencyCode, context: {}, items: sim.items.filter((i: any) => i.amount).map((i: any) => ({ key: i.key, amount: i.amount, refs: i.ref ? { [i.refKey]: i.ref } : undefined })) }), onSuccess: setSimResult, onError: (e) => toast.error(e) });
  const base = useBaseCurrency();

  const openNew = () => { setCondText('{}'); setForm({ eventCode: events.data?.[0]?.code ?? '', name: '', ledger: 'FINANCIAL', priority: 100, effectiveFrom: `${today().slice(0, 4)}-01-01`, effectiveTo: '', isActive: true, lines: [{ lineNo: 1, side: 'DEBIT', accountSource: 'FIXED', accountId: '', amountKey: 'AMOUNT', dimensionPolicy: 'INHERIT_ALL', descriptionTemplate: '' }, { lineNo: 2, side: 'CREDIT', accountSource: 'FIXED', accountId: '', amountKey: 'AMOUNT', dimensionPolicy: 'INHERIT_ALL', descriptionTemplate: '' }] }); };
  const updLine = (i: number, patch: Partial<RuleLineForm>) => setForm({ ...form, lines: form.lines.map((l: RuleLineForm, j: number) => (j === i ? { ...l, ...patch } : l)) });

  if (events.isLoading || rules.isLoading) return <Loading />;
  if (rules.error) return <ErrorState error={rules.error} />;
  const byEvent = new Map<string, any[]>();
  for (const r of rules.data ?? []) byEvent.set(r.eventCode, [...(byEvent.get(r.eventCode) ?? []), r]);

  return (
    <div>
      <PageHeader title="قواعد الترحيل" subtitle="تحدد الحسابات المستخدمة لكل حدث مالي (رواتب، إيرادات، إهلاك…). لا توجد حسابات مثبتة في الكود؛ كل التوجيه المحاسبي من هنا." actions={<button className="btn-primary" onClick={openNew}><Plus className="size-4" /> قاعدة جديدة</button>} />
      <div className="card overflow-hidden">
        <table className="table">
          <thead><tr><th>الحدث</th><th>الوصف</th><th>القواعد المعرفة</th><th /></tr></thead>
          <tbody>
            {events.data!.map((ev) => {
              const rs = byEvent.get(ev.code) ?? [];
              return (
                <Fragment key={ev.code}>
                  <tr>
                    <td className="font-mono text-xs" dir="ltr">{ev.code}</td>
                    <td>{ev.descriptionAr}</td>
                    <td>{rs.length ? <Badge color="green">{rs.length} قاعدة</Badge> : <Badge color="amber">غير معرّف</Badge>}</td>
                    <td className="text-end"><button className="btn-ghost h-7 px-2 text-xs" onClick={() => setSim({ eventCode: ev.code, entryDate: today(), currencyCode: base, items: ev.amountKeys.map((k: string) => ({ key: k, amount: '', refKey: 'accountId', ref: '' })) })}><FlaskConical className="size-3.5" /> محاكاة</button></td>
                  </tr>
                  {rs.map((r) => (
                    <tr key={r.id} className="bg-slate-50/60 dark:bg-slate-800/30">
                      <td />
                      <td colSpan={2} className="text-xs">
                        <div className="font-medium">{r.name} <Badge>{LEDGER[r.ledger]}</Badge> <span className="text-slate-500">أولوية {r.priority} • من {date(r.effectiveFrom)}{r.effectiveTo ? ` إلى ${date(r.effectiveTo)}` : ''}</span> {!r.isActive && <Badge>غير نشط</Badge>}</div>
                        <div className="mt-1 space-y-0.5">
                          {r.lines.map((l: any) => <div key={l.id}>{l.side === 'DEBIT' ? 'مدين' : 'دائن'}: {l.accountSource === 'FIXED' ? accounts.data?.find((a) => a.id === l.accountId)?.nameAr : ACCOUNT_SOURCE[l.accountSource]} ← {l.amountKey}</div>)}
                        </div>
                      </td>
                      <td className="text-end">
                        <button className="btn-ghost h-7 px-2" onClick={() => { setCondText(JSON.stringify(r.conditions ?? {})); setForm({ ...r, effectiveTo: r.effectiveTo ?? '', lines: r.lines.map((l: any) => ({ ...l, accountId: l.accountId ?? '', descriptionTemplate: l.descriptionTemplate ?? '' })) }); }}><Pencil className="size-3.5" /></button>
                        <button className="btn-ghost h-7 px-2 text-rose-600" onClick={() => confirm('حذف القاعدة؟') && del.mutate(r.id)}><Trash2 className="size-3.5" /></button>
                      </td>
                    </tr>
                  ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <Modal wide open={!!form} onClose={() => setForm(null)} title={form?.id ? 'تعديل قاعدة ترحيل' : 'قاعدة ترحيل جديدة'}
        footer={<><button className="btn-secondary" onClick={() => setForm(null)}>إلغاء</button><button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending && <Spinner />} حفظ</button></>}>
        {form && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <Field label="الحدث"><select className="input" disabled={!!form.id} value={form.eventCode} onChange={(e) => setForm({ ...form, eventCode: e.target.value })}>{events.data!.map((x) => <option key={x.code} value={x.code}>{x.descriptionAr} ({x.code})</option>)}</select></Field>
              <Field label="اسم القاعدة"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
              <Field label="الدفتر"><select className="input" value={form.ledger} onChange={(e) => setForm({ ...form, ledger: e.target.value })}><option value="FINANCIAL">مالي</option><option value="MANAGEMENT">إداري</option></select></Field>
              <Field label="الأولوية" hint="الأقل يُختار أولًا"><input className="input" dir="ltr" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} /></Field>
              <Field label="سارية من"><input className="input" type="date" value={form.effectiveFrom} onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })} /></Field>
              <Field label="سارية إلى"><input className="input" type="date" value={form.effectiveTo} onChange={(e) => setForm({ ...form, effectiveTo: e.target.value })} /></Field>
              <Field label="شروط التطبيق (JSON)" className="col-span-2" hint='مثال: {"componentType":"INSURANCE"} — فارغ = تنطبق دائمًا'><input className="input font-mono" dir="ltr" value={condText} onChange={(e) => setCondText(e.target.value)} /></Field>
              <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> نشطة</label>
            </div>
            {ev && <p className="text-xs text-slate-500">مفاتيح المبالغ المتاحة: <b dir="ltr">{ev.amountKeys.join(', ') || 'حسب المستند'}</b> • مصادر الحسابات المدعومة: {ev.accountSources.map((s: string) => ACCOUNT_SOURCE[s]).join('، ') || 'حساب ثابت'}</p>}
            <table className="table">
              <thead><tr><th>الجانب</th><th>مصدر الحساب</th><th>الحساب</th><th>مفتاح المبلغ</th><th>سياسة الأبعاد</th><th /></tr></thead>
              <tbody>
                {form.lines.map((l: RuleLineForm, i: number) => (
                  <tr key={i}>
                    <td><select className="input w-24" value={l.side} onChange={(e) => updLine(i, { side: e.target.value as 'DEBIT' })}><option value="DEBIT">مدين</option><option value="CREDIT">دائن</option></select></td>
                    <td><select className="input w-52" value={l.accountSource} onChange={(e) => updLine(i, { accountSource: e.target.value })}>{Object.entries(ACCOUNT_SOURCE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></td>
                    <td className="min-w-64"><AccountSelect accounts={accounts.data ?? []} value={l.accountId} onChange={(v) => updLine(i, { accountId: v })} /><div className="mt-0.5 text-[11px] text-slate-500">{l.accountSource === 'FIXED' ? 'إلزامي' : 'احتياطي اختياري'}</div></td>
                    <td><input className="input w-28" dir="ltr" value={l.amountKey} onChange={(e) => updLine(i, { amountKey: e.target.value.toUpperCase() })} /></td>
                    <td><select className="input w-44" value={l.dimensionPolicy} onChange={(e) => updLine(i, { dimensionPolicy: e.target.value })}>{Object.entries(DIMENSION_POLICY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></td>
                    <td><button className="btn-ghost h-8 px-2 text-rose-600" disabled={form.lines.length <= 2} onClick={() => setForm({ ...form, lines: form.lines.filter((_: unknown, j: number) => j !== i) })}><Trash2 className="size-3.5" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="btn-secondary" onClick={() => setForm({ ...form, lines: [...form.lines, { lineNo: form.lines.length + 1, side: 'DEBIT', accountSource: 'FIXED', accountId: '', amountKey: ev?.amountKeys?.[0] ?? 'AMOUNT', dimensionPolicy: 'INHERIT_ALL', descriptionTemplate: '' }] })}><Plus className="size-4" /> سطر</button>
          </div>
        )}
      </Modal>

      <Modal wide open={!!sim} onClose={() => { setSim(null); setSimResult(null); }} title={`محاكاة الترحيل — ${sim?.eventCode ?? ''}`}
        footer={<><button className="btn-secondary" onClick={() => { setSim(null); setSimResult(null); }}>إغلاق</button><button className="btn-primary" disabled={simulate.isPending} onClick={() => simulate.mutate()}>{simulate.isPending && <Spinner />} تشغيل المحاكاة</button></>}>
        {sim && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">المحاكاة لا تحفظ أي شيء؛ تعرض القيد الذي سينتج عن القاعدة المطبقة.</p>
            <div className="grid grid-cols-3 gap-3">
              <Field label="التاريخ"><input className="input" type="date" value={sim.entryDate} onChange={(e) => setSim({ ...sim, entryDate: e.target.value })} /></Field>
              <Field label="العملة"><input className="input" dir="ltr" value={sim.currencyCode} onChange={(e) => setSim({ ...sim, currencyCode: e.target.value.toUpperCase() })} /></Field>
            </div>
            {sim.items.map((it: any, i: number) => (
              <div key={i} className="flex items-end gap-2">
                <Field label={`المبلغ (${it.key})`} className="w-40"><input className="input num" value={it.amount} onChange={(e) => setSim({ ...sim, items: sim.items.map((x: any, j: number) => (j === i ? { ...x, amount: e.target.value } : x)) })} /></Field>
                <Field label="مرجع (اختياري)" className="w-40"><select className="input" value={it.refKey} onChange={(e) => setSim({ ...sim, items: sim.items.map((x: any, j: number) => (j === i ? { ...x, refKey: e.target.value } : x)) })}><option value="accountId">حساب من المستند</option><option value="bankAccountId">حساب بنكي</option><option value="taxCodeId">رمز ضريبي</option><option value="componentId">مكون تكلفة</option><option value="clientId">عميل</option></select></Field>
                <Field label="المعرّف (UUID)" className="flex-1"><input className="input font-mono text-xs" dir="ltr" value={it.ref} onChange={(e) => setSim({ ...sim, items: sim.items.map((x: any, j: number) => (j === i ? { ...x, ref: e.target.value } : x)) })} /></Field>
              </div>
            ))}
            {simResult && (
              <div>
                <div className="mb-2 text-sm">القاعدة المطبقة: <b>{simResult.rule.name}</b> ({LEDGER[simResult.rule.ledger]})</div>
                <table className="table">
                  <thead><tr><th>الحساب</th><th>مدين (أساسي)</th><th>دائن (أساسي)</th></tr></thead>
                  <tbody>{simResult.lines.map((l: any, i: number) => <tr key={i}><td><span className="num">{l.accountCode}</span> — {l.accountNameAr}</td><td className="num">{money(l.debitBase)}</td><td className="num">{money(l.creditBase)}</td></tr>)}</tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

export function useQueryParam(name: string): [string, (v: string) => void] {
  const [sp, setSp] = useSearchParams();
  return [sp.get(name) ?? '', (v: string) => { const n = new URLSearchParams(sp); if (v) n.set(name, v); else n.delete(name); setSp(n, { replace: true }); }];
}
