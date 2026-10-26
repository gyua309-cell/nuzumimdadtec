import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Plus, ShieldCheck, Trash2, UserX, UserCheck } from 'lucide-react';
import { api, Page } from '../lib/api';
import { useAuth } from '../lib/auth';
import { dateTime } from '../lib/format';
import { AUDIT_ACTION } from '../lib/labels';
import { useQueryParam } from './accounting';
import { Badge, Drawer, EmptyState, ErrorState, Field, Loading, Modal, PageHeader, Pager, Spinner, useToast } from '../components/ui';

// ------------------------------------------------------------------ audit
function JsonDiff({ oldV, newV }: { oldV: any; newV: any }) {
  const keys = [...new Set([...Object.keys(oldV ?? {}), ...Object.keys(newV ?? {})])].sort();
  return (
    <table className="table text-xs">
      <thead><tr><th>الحقل</th><th>القيمة السابقة</th><th>القيمة الجديدة</th></tr></thead>
      <tbody>
        {keys.map((k) => {
          const a = JSON.stringify(oldV?.[k] ?? null);
          const b = JSON.stringify(newV?.[k] ?? null);
          const changed = a !== b;
          return (
            <tr key={k} className={changed ? 'bg-amber-50 dark:bg-amber-900/20' : ''}>
              <td className="font-mono" dir="ltr">{k}</td>
              <td className="font-mono break-all" dir="ltr">{oldV ? a : ''}</td>
              <td className={`font-mono break-all ${changed ? 'font-bold' : ''}`} dir="ltr">{newV ? b : ''}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function AuditLogPage() {
  const [entityId, setEntityId] = useQueryParam('entityId');
  const [f, setF] = useState({ table: '', action: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ['audit', f, entityId, page], queryFn: () => api.get<Page<any>>('/audit-log', { ...f, entityId, page, pageSize: 50 }) });
  const [sel, setSel] = useState<any | null>(null);
  return (
    <div>
      <PageHeader title="سجل التدقيق" subtitle="كل إضافة أو تعديل أو حذف أو ترحيل أو إقفال مسجل من قاعدة البيانات مباشرة مع المستخدم والوقت والقيم قبل وبعد. السجل غير قابل للتعديل." />
      <div className="card overflow-hidden">
        <div className="flex flex-wrap gap-2 border-b border-slate-200 p-3 dark:border-slate-800">
          <input className="input w-48" dir="ltr" placeholder="الجدول (مثال: journal_entries)" value={f.table} onChange={(e) => setF({ ...f, table: e.target.value.trim() })} />
          <select className="input w-36" value={f.action} onChange={(e) => setF({ ...f, action: e.target.value })}><option value="">كل العمليات</option>{Object.entries(AUDIT_ACTION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <input className="input w-72 font-mono text-xs" dir="ltr" placeholder="معرّف السجل" value={entityId} onChange={(e) => setEntityId(e.target.value.trim())} />
          <input className="input w-40" type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
          <input className="input w-40" type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
        </div>
        {q.isLoading ? <Loading /> : q.error ? <div className="p-4"><ErrorState error={q.error} /></div> : q.data!.data.length === 0 ? <EmptyState text="لا توجد سجلات مطابقة." /> : (
          <>
            <table className="table">
              <thead><tr><th>الوقت</th><th>المستخدم</th><th>العملية</th><th>الجدول</th><th>المعرّف</th><th>الحقول المعدلة</th><th>السبب</th><th>IP</th></tr></thead>
              <tbody>
                {q.data!.data.map((a) => (
                  <tr key={a.id} className="cursor-pointer" onClick={() => setSel(a)}>
                    <td className="whitespace-nowrap">{dateTime(a.occurredAt)}</td><td>{a.userName ?? 'النظام'}</td>
                    <td><Badge color={a.action === 'DELETE' ? 'red' : a.action === 'INSERT' ? 'green' : 'blue'}>{AUDIT_ACTION[a.action] ?? a.action}</Badge></td>
                    <td className="font-mono text-xs" dir="ltr">{a.schemaName}.{a.tableName}</td>
                    <td className="font-mono text-[11px]" dir="ltr">{a.entityId?.slice(0, 8)}…</td>
                    <td className="max-w-xs truncate text-xs" dir="ltr">{(a.changedFields ?? []).join(', ')}</td>
                    <td className="max-w-xs truncate text-xs">{a.reason ?? ''}</td><td className="text-xs" dir="ltr">{a.ip ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pager {...q.data!.meta} onPage={setPage} />
          </>
        )}
      </div>
      <Drawer open={!!sel} onClose={() => setSel(null)} title="تفاصيل سجل التدقيق">
        {sel && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <div><span className="text-slate-500">الوقت:</span> {dateTime(sel.occurredAt)}</div>
              <div><span className="text-slate-500">المستخدم:</span> {sel.userName ?? 'النظام'}</div>
              <div><span className="text-slate-500">العملية:</span> {AUDIT_ACTION[sel.action] ?? sel.action}</div>
              <div><span className="text-slate-500">الطلب:</span> <span className="font-mono text-xs" dir="ltr">{sel.requestId}</span></div>
              <div className="col-span-2"><span className="text-slate-500">الجهاز:</span> <span className="text-xs" dir="ltr">{sel.device}</span></div>
              {sel.reason && <div className="col-span-2"><span className="text-slate-500">السبب:</span> {sel.reason}</div>}
              <div className="col-span-2"><span className="text-slate-500">بصمة السجل:</span> <span className="font-mono text-[11px] break-all" dir="ltr">{sel.rowHash}</span></div>
            </div>
            <JsonDiff oldV={sel.oldValues} newV={sel.newValues} />
          </div>
        )}
      </Drawer>
    </div>
  );
}

export function SecurityEventsPage() {
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ['security-events', page], queryFn: () => api.get<Page<any>>('/security-events', { page, pageSize: 50 }) });
  return (
    <div>
      <PageHeader title="الأحداث الأمنية" subtitle="محاولات الدخول، القفل، تغيير كلمات المرور، إعادة استخدام رموز التحديث." />
      <div className="card overflow-hidden">
        {q.isLoading ? <Loading /> : q.error ? <div className="p-4"><ErrorState error={q.error} /></div> : q.data!.data.length === 0 ? <EmptyState text="لا توجد أحداث." /> : (
          <>
            <table className="table">
              <thead><tr><th>الوقت</th><th>المستخدم</th><th>الحدث</th><th>IP</th><th>التفاصيل</th></tr></thead>
              <tbody>{q.data!.data.map((e) => <tr key={e.id}><td>{dateTime(e.occurredAt)}</td><td dir="ltr">{e.username ?? '—'}</td><td><Badge color={/FAIL|LOCK|REUSE/.test(e.eventType) ? 'red' : 'slate'}>{e.eventType}</Badge></td><td dir="ltr">{e.ip}</td><td className="max-w-md truncate font-mono text-xs" dir="ltr">{e.details ? JSON.stringify(e.details) : ''}</td></tr>)}</tbody>
            </table>
            <Pager {...q.data!.meta} onPage={setPage} />
          </>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ users
export function UsersPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ['users', page], queryFn: () => api.get<Page<any>>('/users', { page, pageSize: 50 }) });
  const roles = useQuery({ queryKey: ['roles'], queryFn: () => api.get<any[]>('/roles') });
  const [create, setCreate] = useState<Record<string, any> | null>(null);
  const [reset, setReset] = useState<any | null>(null);
  const [pwd, setPwd] = useState('');
  const [assign, setAssign] = useState<any | null>(null);
  const [roleId, setRoleId] = useState('');
  const inv = () => qc.invalidateQueries({ queryKey: ['users'] });
  const saveUser = useMutation({ mutationFn: () => api.post('/users', create), onSuccess: () => { toast.success('تم إنشاء المستخدم'); setCreate(null); inv(); }, onError: (e) => toast.error(e) });
  const toggle = useMutation({ mutationFn: (u: any) => api.patch(`/users/${u.id}`, { status: u.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' }), onSuccess: inv, onError: (e) => toast.error(e) });
  const doReset = useMutation({ mutationFn: () => api.post(`/users/${reset.id}/reset-password`, { password: pwd }), onSuccess: () => { toast.success('تمت إعادة تعيين كلمة المرور'); setReset(null); }, onError: (e) => toast.error(e) });
  const doAssign = useMutation({ mutationFn: () => api.post(`/users/${assign.id}/roles`, { roleId }), onSuccess: () => { toast.success('تم إسناد الدور'); setAssign(null); inv(); }, onError: (e) => toast.error(e) });
  const unassign = useMutation({ mutationFn: ({ u, a }: { u: string; a: string }) => api.del(`/users/${u}/roles/${a}`), onSuccess: inv, onError: (e) => toast.error(e) });
  return (
    <div>
      <PageHeader title="المستخدمون" actions={<button className="btn-primary" onClick={() => setCreate({ username: '', fullName: '', email: '', password: '', preferredLocale: 'ar', mustChangePassword: true })}><Plus className="size-4" /> مستخدم جديد</button>} />
      <div className="card overflow-hidden">
        {q.isLoading ? <Loading /> : q.error ? <div className="p-4"><ErrorState error={q.error} /></div> : (
          <>
            <table className="table">
              <thead><tr><th>اسم المستخدم</th><th>الاسم</th><th>البريد</th><th>الأدوار في هذه الشركة</th><th>الحالة</th><th>آخر دخول</th><th /></tr></thead>
              <tbody>
                {q.data!.data.map((u) => (
                  <tr key={u.id}>
                    <td dir="ltr" className="text-start font-medium">{u.username}</td><td>{u.fullName} {u.isSystemAdmin && <Badge color="blue">مدير النظام</Badge>}</td><td dir="ltr" className="text-start">{u.email ?? '—'}</td>
                    <td><div className="flex flex-wrap gap-1">{u.roles.map((r: any) => <span key={r.assignmentId} className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-xs dark:bg-slate-800">{r.roleName}<button className="text-rose-500" onClick={() => unassign.mutate({ u: u.id, a: r.assignmentId })}>×</button></span>)}</div></td>
                    <td>{u.status === 'ACTIVE' ? <Badge color="green">نشط</Badge> : <Badge color="red">معطل</Badge>} {u.lockedUntil && new Date(u.lockedUntil) > new Date() && <Badge color="amber">مقفل مؤقتًا</Badge>}</td>
                    <td>{dateTime(u.lastLoginAt)}</td>
                    <td><div className="flex justify-end gap-1">
                      <button className="btn-ghost h-7 px-2" title="إسناد دور" onClick={() => { setRoleId(''); setAssign(u); }}><ShieldCheck className="size-3.5" /></button>
                      <button className="btn-ghost h-7 px-2" title="إعادة تعيين كلمة المرور" onClick={() => { setPwd(''); setReset(u); }}><KeyRound className="size-3.5" /></button>
                      {!u.isSystemAdmin && <button className="btn-ghost h-7 px-2" title={u.status === 'ACTIVE' ? 'تعطيل' : 'تفعيل'} onClick={() => toggle.mutate(u)}>{u.status === 'ACTIVE' ? <UserX className="size-3.5 text-rose-600" /> : <UserCheck className="size-3.5 text-emerald-600" />}</button>}
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pager {...q.data!.meta} onPage={setPage} />
          </>
        )}
      </div>
      <Modal open={!!create} onClose={() => setCreate(null)} title="مستخدم جديد" footer={<><button className="btn-secondary" onClick={() => setCreate(null)}>إلغاء</button><button className="btn-primary" disabled={saveUser.isPending} onClick={() => saveUser.mutate()}>{saveUser.isPending && <Spinner />} إنشاء</button></>}>
        {create && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="اسم المستخدم"><input className="input" dir="ltr" value={create.username} onChange={(e) => setCreate({ ...create, username: e.target.value })} /></Field>
            <Field label="الاسم الكامل"><input className="input" value={create.fullName} onChange={(e) => setCreate({ ...create, fullName: e.target.value })} /></Field>
            <Field label="البريد الإلكتروني" className="col-span-2"><input className="input" dir="ltr" value={create.email} onChange={(e) => setCreate({ ...create, email: e.target.value || undefined })} /></Field>
            <Field label="كلمة المرور المؤقتة" hint="10 أحرف على الأقل، حروف وأرقام"><input className="input" dir="ltr" type="password" value={create.password} onChange={(e) => setCreate({ ...create, password: e.target.value })} /></Field>
            <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={create.mustChangePassword} onChange={(e) => setCreate({ ...create, mustChangePassword: e.target.checked })} /> يجب تغيير كلمة المرور عند أول دخول</label>
          </div>
        )}
      </Modal>
      <Modal open={!!reset} onClose={() => setReset(null)} title={`إعادة تعيين كلمة مرور ${reset?.username ?? ''}`} footer={<button className="btn-primary" disabled={pwd.length < 10} onClick={() => doReset.mutate()}>حفظ</button>}>
        <Field label="كلمة المرور الجديدة"><input className="input" dir="ltr" type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} /></Field>
      </Modal>
      <Modal open={!!assign} onClose={() => setAssign(null)} title={`إسناد دور إلى ${assign?.fullName ?? ''}`} footer={<button className="btn-primary" disabled={!roleId} onClick={() => doAssign.mutate()}>إسناد</button>}>
        <Field label="الدور"><select className="input" value={roleId} onChange={(e) => setRoleId(e.target.value)}><option value="">—</option>{(roles.data ?? []).map((r) => <option key={r.id} value={r.id}>{r.nameAr} {r.isTemplate ? '(قالب)' : ''}</option>)}</select></Field>
      </Modal>
    </div>
  );
}

// ------------------------------------------------------------------ roles
const ACTION_LABEL: Record<string, string> = { view: 'عرض', create: 'إضافة', edit: 'تعديل', delete: 'حذف', approve: 'اعتماد', post: 'ترحيل', cancel: 'إلغاء', export: 'تصدير', print: 'طباعة', view_sensitive: 'بيانات حساسة', close: 'إقفال', reopen: 'إعادة فتح' };
const MODULE_LABEL: Record<string, string> = { core: 'المؤسسة', hr: 'الموارد البشرية', cost: 'التكلفة', prj: 'المشاريع', pay: 'الرواتب', ast: 'الأصول', rev: 'الإيرادات', exp: 'المصروفات', acc: 'المحاسبة', close: 'الإقفال', wf: 'سير العمل', rpt: 'التقارير', dash: 'لوحة التحكم', audit: 'التدقيق', iam: 'المستخدمون', sys: 'النظام' };

export function RolesPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const { me } = useAuth();
  const roles = useQuery({ queryKey: ['roles'], queryFn: () => api.get<any[]>('/roles') });
  const perms = useQuery({ queryKey: ['permissions'], queryFn: () => api.get<any[]>('/permissions') });
  const [form, setForm] = useState<any | null>(null);
  const actions = useMemo(() => [...new Set((perms.data ?? []).map((p) => p.action))], [perms.data]);
  const resources = useMemo(() => {
    const m = new Map<string, any>();
    for (const p of perms.data ?? []) {
      const k = `${p.module}.${p.resource}`;
      if (!m.has(k)) m.set(k, { key: k, module: p.module, label: (p.descriptionAr as string).split(' — ')[0], actions: new Set<string>() });
      m.get(k).actions.add(p.action);
    }
    return [...m.values()];
  }, [perms.data]);
  const open = async (r: any | null) => {
    if (!r) return setForm({ code: '', nameAr: '', nameEn: '', description: '', permissions: new Set<string>() });
    const full = await api.get<any>(`/roles/${r.id}`);
    setForm({ ...full, readonly: full.isTemplate, permissions: new Set<string>(full.permissions) });
  };
  const save = useMutation({
    mutationFn: () => {
      const body = { code: form.code, nameAr: form.nameAr, nameEn: form.nameEn || null, description: form.description || null, permissions: [...form.permissions] };
      return form.id ? api.patch(`/roles/${form.id}`, { ...body, rowVersion: form.rowVersion }) : api.post('/roles', body);
    },
    onSuccess: () => { toast.success('تم حفظ الدور'); setForm(null); qc.invalidateQueries({ queryKey: ['roles'] }); },
    onError: (e) => toast.error(e),
  });
  const del = useMutation({ mutationFn: (id: string) => api.del(`/roles/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['roles'] }), onError: (e) => toast.error(e) });
  const toggle = (code: string) => { const s = new Set<string>(form.permissions); s.has(code) ? s.delete(code) : s.add(code); setForm({ ...form, permissions: s }); };
  if (roles.isLoading) return <Loading />;
  if (roles.error) return <ErrorState error={roles.error} />;
  return (
    <div>
      <PageHeader title="الأدوار والصلاحيات" subtitle="القوالب الجاهزة للعرض والنسخ فقط. أنشئ أدوار الشركة واختر الصلاحيات من المصفوفة." actions={<button className="btn-primary" onClick={() => open(null)}><Plus className="size-4" /> دور جديد</button>} />
      <div className="card overflow-hidden">
        {roles.data!.length === 0 ? <EmptyState text="لا توجد أدوار" /> : (
          <table className="table">
            <thead><tr><th>الرمز</th><th>الاسم</th><th>النوع</th><th>الصلاحيات</th><th>المستخدمون</th><th /></tr></thead>
            <tbody>{roles.data!.map((r) => (
              <tr key={r.id} className="cursor-pointer" onClick={() => open(r)}>
                <td className="font-mono text-xs" dir="ltr">{r.code}</td><td>{r.nameAr}</td><td>{r.isTemplate ? <Badge color="blue">قالب</Badge> : <Badge>دور الشركة</Badge>}</td>
                <td className="num">{r.permissionCount}</td><td className="num">{r.userCount}</td>
                <td onClick={(e) => e.stopPropagation()}>{!r.isTemplate && !r.isSystem && <button className="btn-ghost h-7 px-2 text-rose-600" onClick={() => confirm('حذف الدور؟') && del.mutate(r.id)}><Trash2 className="size-3.5" /></button>}
                  {r.isTemplate && <button className="btn-ghost h-7 px-2 text-xs" onClick={async () => { const full = await api.get<any>(`/roles/${r.id}`); setForm({ code: `${full.code}_COPY`, nameAr: `${full.nameAr} (نسخة)`, nameEn: '', description: full.description ?? '', permissions: new Set(full.permissions) }); }}>نسخ</button>}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
      <Modal wide open={!!form} onClose={() => setForm(null)} title={form?.readonly ? `قالب: ${form?.nameAr}` : form?.id ? 'تعديل الدور' : 'دور جديد'}
        footer={!form?.readonly && <><button className="btn-secondary" onClick={() => setForm(null)}>إلغاء</button><button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending && <Spinner />} حفظ</button></>}>
        {form && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <Field label="الرمز"><input className="input" dir="ltr" disabled={!!form.id} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} /></Field>
              <Field label="الاسم بالعربية"><input className="input" disabled={form.readonly} value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} /></Field>
              <Field label="الوصف"><input className="input" disabled={form.readonly} value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
            </div>
            <div className="text-xs text-slate-500">محدد: <span className="num">{form.permissions.size}</span> صلاحية {me?.user.isSystemAdmin && '— مدير النظام يملك كل الصلاحيات تلقائيًا'}</div>
            <div className="max-h-[50vh] overflow-auto rounded-lg border border-slate-200 dark:border-slate-800">
              <table className="table text-xs">
                <thead><tr><th>الوحدة</th><th>المورد</th>{actions.map((a) => <th key={a} className="text-center">{ACTION_LABEL[a] ?? a}</th>)}</tr></thead>
                <tbody>{resources.map((r) => (
                  <tr key={r.key}>
                    <td>{MODULE_LABEL[r.module] ?? r.module}</td><td>{r.label}</td>
                    {actions.map((a) => { const code = `${r.key}.${a}`; return <td key={a} className="text-center">{r.actions.has(a) && <input type="checkbox" disabled={form.readonly} checked={form.permissions.has(code)} onChange={() => toggle(code)} />}</td>; })}
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
