import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, ArrowLeftRight, CheckCircle2, History, Layers,
  Pencil, Plus, ShieldCheck, Trash2,
} from 'lucide-react';
import { api } from '../lib/api';
import { dateTime, money, today } from '../lib/format';
import {
  ACCOUNT_CLASS,
  CASH_FLOW,
  EQUITY_SECTION_LABELS,
  STATEMENT_SECTION_LABELS,
  STATEMENT_TYPE_LABELS,
} from '../lib/labels';
import { Badge, EmptyState, Field, Loading, Modal, Spinner, useToast } from './ui';

export interface StatementLineItem {
  id: string;
  statementType: 'BALANCE_SHEET' | 'INCOME_STATEMENT' | 'CASH_FLOW' | 'EQUITY_CHANGES';
  sectionCode: string;
  code: string;
  nameAr: string;
  nameEn?: string | null;
  normalSign: 1 | -1;
  sortOrder: number;
  isSystem?: boolean;
  isActive?: boolean;
  description?: string | null;
  mappedAccountsCount?: number;
}

const SECTIONS_BY_STATEMENT: Record<string, Array<{ value: string; label: string }>> = {
  BALANCE_SHEET: [
    { value: 'CURRENT_ASSETS', label: 'الأصول المتداولة' },
    { value: 'NON_CURRENT_ASSETS', label: 'الأصول غير المتداولة' },
    { value: 'CURRENT_LIABILITIES', label: 'الالتزامات المتداولة' },
    { value: 'NON_CURRENT_LIABILITIES', label: 'الالتزامات طويلة الأجل' },
    { value: 'EQUITY', label: 'حقوق الملكية' },
  ],
  INCOME_STATEMENT: [
    { value: 'REVENUE', label: 'الإيرادات التشغيلية' },
    { value: 'COST_OF_SALES', label: 'تكلفة المبيعات والخدمات المباشرة' },
    { value: 'OPERATING_EXPENSES', label: 'المصروفات التشغيلية والإدارية' },
    { value: 'OTHER_INCOME', label: 'الإيرادات الأخرى' },
    { value: 'OTHER_EXPENSES', label: 'المصروفات الأخرى' },
    { value: 'ZAKAT_TAX', label: 'مصروف الزكاة والضريبة' },
  ],
  CASH_FLOW: [
    { value: 'OPERATING_ACTIVITIES', label: 'الأنشطة التشغيلية' },
    { value: 'INVESTING_ACTIVITIES', label: 'الأنشطة الاستثمارية' },
    { value: 'FINANCING_ACTIVITIES', label: 'الأنشطة التمويلية' },
    { value: 'CASH_EQUIVALENTS', label: 'النقدية وما في حكمها' },
  ],
  EQUITY_CHANGES: [
    { value: 'PAID_IN_CAPITAL', label: 'رأس المال المدفوع' },
    { value: 'STATUTORY_RESERVE', label: 'الاحتياطي النظامي' },
    { value: 'RETAINED_EARNINGS', label: 'الأرباح المبقاة' },
    { value: 'DIVIDENDS_DISTRIBUTIONS', label: 'التوزيعات وجاري الشركاء' },
    { value: 'OTHER_EQUITY', label: 'بنود حقوق ملكية أخرى' },
  ],
};

export function invalidateAllAccountingQueries(qc: ReturnType<typeof useQueryClient>) {
  const keys = ['accounts', 'statement-lines', 'account-reclassifications', 'tb', 'is', 'bs', 'cf', 'eq', 'acct-stmt', 'journals', 'journal', 'ref'];
  for (const k of keys) qc.invalidateQueries({ queryKey: [k] });
}

export function StatementMappingManager({ accounts }: { accounts: any[] }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [activeStmt, setActiveStmt] = useState<'BALANCE_SHEET' | 'INCOME_STATEMENT' | 'CASH_FLOW' | 'EQUITY_CHANGES'>('BALANCE_SHEET');
  const [lineModal, setLineModal] = useState<Partial<StatementLineItem> | null>(null);
  const [reclassAcc, setReclassAcc] = useState<any | null>(null);
  const [reclassForm, setReclassForm] = useState({
    statementSection: '',
    statementLineId: '',
    equityLineId: '',
    cashFlowCategory: '',
    effectiveFrom: today(),
    reason: '',
  });
  const [showHistory, setShowHistory] = useState(false);

  const linesQ = useQuery({
    queryKey: ['statement-lines'],
    queryFn: () =>
      api.get<any>('/statement-lines').then((r: any) => (Array.isArray(r) ? r : (r?.data ?? [])) as StatementLineItem[]),
  });

  const historyQ = useQuery({
    queryKey: ['account-reclassifications'],
    enabled: showHistory,
    queryFn: () =>
      api.get<any>('/accounts/reclassifications').then((r: any) => (Array.isArray(r) ? r : (r?.data ?? [])) as any[]),
  });

  const saveLine = useMutation({
    mutationFn: () => {
      const l = lineModal!;
      const payload = {
        statementType: l.statementType || activeStmt,
        sectionCode: l.sectionCode || SECTIONS_BY_STATEMENT[l.statementType || activeStmt][0].value,
        code: l.code,
        nameAr: l.nameAr,
        nameEn: l.nameEn || null,
        normalSign: l.normalSign || 1,
        sortOrder: Number(l.sortOrder || 100),
        isActive: l.isActive !== false,
        description: l.description || null,
      };
      return l.id ? api.patch(`/statement-lines/${l.id}`, payload) : api.post('/statement-lines', payload);
    },
    onSuccess: () => {
      toast.success('تم حفظ بند القائمة المالية وتحديث الربط تلقائياً');
      setLineModal(null);
      invalidateAllAccountingQueries(qc);
    },
    onError: (e) => toast.error(e),
  });

  const deleteLine = useMutation({
    mutationFn: (id: string) => api.del(`/statement-lines/${id}`),
    onSuccess: () => {
      toast.success('تم حذف البند بنجاح');
      invalidateAllAccountingQueries(qc);
    },
    onError: (e) => toast.error(e),
  });

  const doReclassify = useMutation({
    mutationFn: () =>
      api.post(`/accounts/${reclassAcc.id}/reclassify`, {
        statementSection: reclassForm.statementSection || undefined,
        statementLineId: reclassForm.statementLineId || undefined,
        equityLineId: reclassForm.equityLineId || undefined,
        cashFlowCategory: reclassForm.cashFlowCategory || undefined,
        effectiveFrom: reclassForm.effectiveFrom || today(),
        reason: reclassForm.reason.trim(),
      }),
    onSuccess: () => {
      toast.success('تم إعادة تصنيف الحساب وتوثيق التغيير في سجل التدقيق وتحديث القوائم المالية فوراً');
      setReclassAcc(null);
      invalidateAllAccountingQueries(qc);
    },
    onError: (e) => toast.error(e),
  });

  const postingAccounts = useMemo(() => accounts.filter((a) => a.isPosting), [accounts]);
  const statementLines = linesQ.data ?? [];
  const activeLines = useMemo(
    () => statementLines.filter((l) => l.statementType === activeStmt).sort((a, b) => a.sortOrder - b.sortOrder),
    [statementLines, activeStmt],
  );

  const unmappedAccounts = useMemo(
    () => postingAccounts.filter((a) => !a.statementSection || !a.cashFlowCategory),
    [postingAccounts],
  );

  const getAccountsForLine = (line: StatementLineItem) => {
    if (line.statementType === 'CASH_FLOW') {
      const map: Record<string, string> = {
        OPERATING_ACTIVITIES: 'OPERATING',
        INVESTING_ACTIVITIES: 'INVESTING',
        FINANCING_ACTIVITIES: 'FINANCING',
        CASH_EQUIVALENTS: 'CASH',
      };
      const targetCat = map[line.sectionCode];
      return postingAccounts.filter((a) => a.cashFlowCategory === targetCat);
    }
    if (line.statementType === 'EQUITY_CHANGES') {
      return postingAccounts.filter(
        (a) => a.statementSection === 'EQUITY' && (a.equityLineId === line.id || (!a.equityLineId && line.sectionCode === 'OTHER_EQUITY')),
      );
    }
    return postingAccounts.filter(
      (a) => a.statementLineId === line.id || (!a.statementLineId && a.statementSection === line.sectionCode),
    );
  };

  const openReclassify = (acc: any) => {
    setReclassAcc(acc);
    setReclassForm({
      statementSection: acc.statementSection || '',
      statementLineId: acc.statementLineId || '',
      equityLineId: acc.equityLineId || '',
      cashFlowCategory: acc.cashFlowCategory || 'OPERATING',
      effectiveFrom: today(),
      reason: '',
    });
  };

  if (linesQ.isLoading) return <Loading />;

  return (
    <div className="space-y-4">
      {/* Audit Coverage Banner */}
      <div className={`rounded-2xl border p-4 flex flex-wrap items-center justify-between gap-3 ${
        unmappedAccounts.length === 0
          ? 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/50 dark:bg-emerald-950/20'
          : 'border-amber-300 bg-amber-50/80 dark:border-amber-800/60 dark:bg-amber-950/25'
      }`}>
        <div className="flex items-center gap-3">
          {unmappedAccounts.length === 0 ? (
            <ShieldCheck className="size-6 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="size-6 text-amber-600 shrink-0" />
          )}
          <div>
            <div className="text-sm font-extrabold text-slate-900 dark:text-white">
              {unmappedAccounts.length === 0
                ? `جميع الحسابات التفصيلية (${postingAccounts.length} حساب) مربوطة ديناميكياً بالقوائم المالية الأربعة بنسبة 100%`
                : `يوجد ${unmappedAccounts.length} حساب غير مربوط بالكامل ببنود القوائم المالية`}
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
              أي تعديل في ربط الحسابات هنا يُوثَّق بتاريخ سريان ومبرر محاسبي ويحافظ على سلامة الفترات التاريخية المقفلة دون أي تعديل للكود.
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn-secondary text-xs flex items-center gap-1.5"
            onClick={() => setShowHistory((v) => !v)}
          >
            <History className="size-3.5" />
            {showHistory ? 'إخفاء سجل إعادة التصنيف' : 'سجل تعديلات التصنيف التاريخية'}
          </button>
          <button
            type="button"
            className="btn-primary text-xs flex items-center gap-1.5"
            onClick={() =>
              setLineModal({
                statementType: activeStmt,
                sectionCode: SECTIONS_BY_STATEMENT[activeStmt][0].value,
                code: '',
                nameAr: '',
                nameEn: '',
                normalSign: 1,
                sortOrder: (activeLines.length + 1) * 10,
                isActive: true,
                description: '',
              })
            }
          >
            <Plus className="size-3.5" /> إضافة بند قائمة مالية مخصص
          </button>
        </div>
      </div>

      {/* Statement Switcher Tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(STATEMENT_TYPE_LABELS) as Array<keyof typeof STATEMENT_TYPE_LABELS>).map((st) => {
          const count = statementLines.filter((l) => l.statementType === st).length;
          return (
            <button
              key={st}
              type="button"
              onClick={() => setActiveStmt(st as any)}
              className={`rounded-xl px-3.5 py-2 text-xs font-extrabold transition-all flex items-center gap-2 border cursor-pointer ${
                activeStmt === st
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                  : 'bg-white dark:bg-[#0c1427] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-indigo-400'
              }`}
            >
              <Layers className="size-3.5" />
              <span>{STATEMENT_TYPE_LABELS[st]}</span>
              <span className={`font-mono px-1.5 py-0.5 rounded-full text-[10px] ${
                activeStmt === st ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Statement Lines Cards & Mapped Accounts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {activeLines.map((line) => {
          const mapped = getAccountsForLine(line);
          const lineTotal = mapped.reduce((s, a) => s + Number(a.currentBalanceBase ?? a.currentBalance ?? 0), 0);
          return (
            <div key={line.id} className="card overflow-hidden border border-slate-200/90 dark:border-slate-800 flex flex-col">
              <div className="flex items-start justify-between gap-3 px-4 py-3 bg-slate-50/90 dark:bg-[#080e1c] border-b border-slate-200/80 dark:border-slate-800">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-[11px] font-black px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 dark:bg-indigo-950/70 dark:text-indigo-300">
                      {line.code}
                    </span>
                    <h4 className="font-extrabold text-sm text-slate-900 dark:text-white">{line.nameAr}</h4>
                    {line.isSystem && <Badge color="blue">بند معياري</Badge>}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    القسم: <strong>{STATEMENT_SECTION_LABELS[line.sectionCode] || EQUITY_SECTION_LABELS[line.sectionCode] || line.sectionCode}</strong>
                    {line.description ? ` — ${line.description}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    className="btn-ghost h-7 px-2"
                    title="تعديل البند"
                    onClick={() => setLineModal({ ...line })}
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  {!line.isSystem && (
                    <button
                      type="button"
                      className="btn-ghost h-7 px-2 text-rose-600"
                      title="حذف البند"
                      onClick={() => confirm(`حذف البند "${line.nameAr}"؟`) && deleteLine.mutate(line.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="p-3.5 flex-1 space-y-2">
                <div className="flex items-center justify-between text-xs pb-2 border-b border-slate-100 dark:border-slate-800/80">
                  <span className="font-bold text-slate-600 dark:text-slate-400">
                    الحسابات المربوطة: <strong className="text-slate-900 dark:text-white font-mono">{mapped.length}</strong>
                  </span>
                  <span className="font-mono font-black text-indigo-700 dark:text-indigo-300">
                    الرصيد الحي: {money(lineTotal)} SAR
                  </span>
                </div>

                {mapped.length === 0 ? (
                  <div className="py-5 text-center text-xs text-slate-400">
                    لا توجد حسابات تفصيلية مربوطة بهذا البند حالياً.
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-60 overflow-y-auto custom-scrollbar pe-1">
                    {mapped.map((acc) => (
                      <div
                        key={acc.id}
                        className="flex items-center justify-between gap-2 rounded-xl border border-slate-200/70 dark:border-slate-800 bg-white dark:bg-[#0c1427] px-2.5 py-2 text-xs hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors"
                      >
                        <div className="min-w-0 flex items-center gap-2">
                          <span className="font-mono font-bold text-[11px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded shrink-0">
                            {acc.code}
                          </span>
                          <Link
                            to={`/reports/account-statement?accountId=${acc.id}`}
                            className="font-bold text-slate-900 dark:text-slate-100 hover:text-indigo-600 hover:underline truncate"
                          >
                            {acc.nameAr}
                          </Link>
                          {acc.isContra && <Badge color="amber">مقابل</Badge>}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                            {money(acc.currentBalanceBase ?? acc.currentBalance ?? 0)}
                          </span>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50/70 dark:bg-indigo-950/40 px-2 py-1 text-[11px] font-bold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-600 hover:text-white transition-colors"
                            onClick={() => openReclassify(acc)}
                            title="تعديل ربط الحساب ببند القائمة المالية أو التدفق النقدي"
                          >
                            <ArrowLeftRight className="size-3" /> ربط
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Historical Reclassification Audit Log */}
      {showHistory && (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-[#080e1c]">
            <h4 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <History className="size-4 text-indigo-600" />
              سجل إعادة تصنيف الحسابات وتوثيق الفترات التاريخية
            </h4>
            <Badge color="blue">التدقيق المحاسبي</Badge>
          </div>
          {historyQ.isLoading ? (
            <Loading />
          ) : (historyQ.data ?? []).length === 0 ? (
            <EmptyState text="لم يتم تسجيل أي تعديل تصنيف لحسابات بعد. كافة التعديلات المستقبلية ستُوثّق هنا تلقائياً بتاريخ سريان ومبرر محاسبي." />
          ) : (
            <div className="overflow-x-auto">
              <table className="table text-xs">
                <thead>
                  <tr>
                    <th>تاريخ التعديل</th>
                    <th>تاريخ السريان</th>
                    <th>الحساب</th>
                    <th>التصنيف السابق</th>
                    <th>التصنيف الجديد</th>
                    <th>التدفق النقدي</th>
                    <th>المبرر المحاسبي</th>
                  </tr>
                </thead>
                <tbody>
                  {(historyQ.data ?? []).map((r: any) => (
                    <tr key={r.id}>
                      <td className="font-mono text-[11px]">{dateTime(r.changedAt)}</td>
                      <td className="font-mono font-bold text-indigo-700 dark:text-indigo-300">{r.effectiveFrom}</td>
                      <td>
                        <span className="font-mono font-bold me-1.5">{r.accountCode}</span>
                        <span>{r.accountNameAr}</span>
                      </td>
                      <td>{STATEMENT_SECTION_LABELS[r.oldStatementSection] || r.oldStatementSection || '—'}</td>
                      <td className="font-bold text-emerald-700 dark:text-emerald-400">
                        {STATEMENT_SECTION_LABELS[r.newStatementSection] || r.newStatementSection || '—'}
                      </td>
                      <td>
                        {CASH_FLOW[r.oldCashFlowCategory] || '—'} ← <strong>{CASH_FLOW[r.newCashFlowCategory] || '—'}</strong>
                      </td>
                      <td className="max-w-xs">{r.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal: Add / Edit Statement Line */}
      <Modal
        open={!!lineModal}
        onClose={() => setLineModal(null)}
        title={lineModal?.id ? `تعديل بند القائمة المالية: ${lineModal.nameAr}` : 'إضافة بند جديد في القائمة المالية'}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setLineModal(null)}>إلغاء</button>
            <button type="button" className="btn-primary" disabled={saveLine.isPending} onClick={() => saveLine.mutate()}>
              {saveLine.isPending && <Spinner />} حفظ البند
            </button>
          </>
        }
      >
        {lineModal && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
            <Field label="القائمة المالية" required>
              <select
                className="input"
                value={lineModal.statementType || activeStmt}
                disabled={!!lineModal.id}
                onChange={(e) => {
                  const st = e.target.value as any;
                  setLineModal({ ...lineModal, statementType: st, sectionCode: SECTIONS_BY_STATEMENT[st][0].value });
                }}
              >
                {Object.entries(STATEMENT_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </Field>
            <Field label="القسم المحاسبي داخل القائمة" required>
              <select
                className="input"
                value={lineModal.sectionCode || ''}
                onChange={(e) => setLineModal({ ...lineModal, sectionCode: e.target.value })}
              >
                {(SECTIONS_BY_STATEMENT[lineModal.statementType || activeStmt] || []).map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </Field>
            <Field label="رمز البند (Code)" required>
              <input
                className="input font-mono"
                dir="ltr"
                disabled={!!lineModal.id}
                placeholder="مثال: BS-CA-INV"
                value={lineModal.code || ''}
                onChange={(e) => setLineModal({ ...lineModal, code: e.target.value.toUpperCase() })}
              />
            </Field>
            <Field label="ترتيب العرض" required>
              <input
                type="number"
                className="input font-mono"
                value={lineModal.sortOrder ?? 100}
                onChange={(e) => setLineModal({ ...lineModal, sortOrder: Number(e.target.value) })}
              />
            </Field>
            <Field label="اسم البند بالعربية" required className="sm:col-span-2">
              <input
                className="input"
                placeholder="مثال: الأصول غير الملموسة والبرمجيات"
                value={lineModal.nameAr || ''}
                onChange={(e) => setLineModal({ ...lineModal, nameAr: e.target.value })}
              />
            </Field>
            <Field label="اسم البند بالإنجليزية" className="sm:col-span-2">
              <input
                className="input"
                dir="ltr"
                value={lineModal.nameEn || ''}
                onChange={(e) => setLineModal({ ...lineModal, nameEn: e.target.value })}
              />
            </Field>
            <Field label="وصف وملاحظات" className="sm:col-span-2">
              <textarea
                className="input h-16 py-2"
                value={lineModal.description || ''}
                onChange={(e) => setLineModal({ ...lineModal, description: e.target.value })}
              />
            </Field>
          </div>
        )}
      </Modal>

      {/* Modal: Reclassify Account with Effective Date & Audit Reason */}
      <Modal
        open={!!reclassAcc}
        onClose={() => setReclassAcc(null)}
        title={`ربط وإعادة تصنيف الحساب: ${reclassAcc?.code || ''} — ${reclassAcc?.nameAr || ''}`}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setReclassAcc(null)}>إلغاء</button>
            <button
              type="button"
              className="btn-primary flex items-center gap-1.5"
              disabled={doReclassify.isPending || reclassForm.reason.trim().length < 3}
              onClick={() => doReclassify.mutate()}
            >
              {doReclassify.isPending ? <Spinner /> : <CheckCircle2 className="size-3.5" />}
              اعتماد وتوثيق الربط
            </button>
          </>
        }
      >
        {reclassAcc && (
          <div className="space-y-4 text-xs">
            <div className="rounded-xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/70 dark:bg-indigo-950/30 p-3">
              <div className="font-bold text-indigo-950 dark:text-indigo-200">
                النوع المحاسبي: {ACCOUNT_CLASS[reclassAcc.accountClass] || reclassAcc.accountClass} • الطبيعة: {reclassAcc.normalBalance === 'DEBIT' ? 'مدين' : 'دائن'}
              </div>
              <div className="text-[11px] text-indigo-700 dark:text-indigo-300 mt-0.5">
                التغيير يسري اعتباراً من تاريخ السريان المحدد ولن يغيّر أرصدة أو نتائج الفترات التاريخية السابقة المقفلة.
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <Field label="القسم في القائمة المالية (المركز المالي / الدخل)" required>
                <select
                  className="input"
                  value={reclassForm.statementSection}
                  onChange={(e) => {
                    const sec = e.target.value;
                    const matchLine = statementLines.find(
                      (s) => s.sectionCode === sec && (s.statementType === 'BALANCE_SHEET' || s.statementType === 'INCOME_STATEMENT'),
                    );
                    setReclassForm({ ...reclassForm, statementSection: sec, statementLineId: matchLine?.id || '' });
                  }}
                >
                  {Object.entries(STATEMENT_SECTION_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </Field>

              <Field label="بند القائمة المالية المحدد">
                <select
                  className="input"
                  value={reclassForm.statementLineId}
                  onChange={(e) => {
                    const sl = statementLines.find((x) => x.id === e.target.value);
                    setReclassForm({
                      ...reclassForm,
                      statementLineId: e.target.value,
                      statementSection: sl?.sectionCode || reclassForm.statementSection,
                    });
                  }}
                >
                  <option value="">— تلقائي حسب القسم —</option>
                  {statementLines
                    .filter((s) => s.statementType === 'BALANCE_SHEET' || s.statementType === 'INCOME_STATEMENT')
                    .map((s) => (
                      <option key={s.id} value={s.id}>[{s.code}] {s.nameAr}</option>
                    ))}
                </select>
              </Field>

              <Field label="تصنيف قائمة التدفقات النقدية (IAS 7)" required>
                <select
                  className="input"
                  value={reclassForm.cashFlowCategory}
                  onChange={(e) => setReclassForm({ ...reclassForm, cashFlowCategory: e.target.value })}
                >
                  {Object.entries(CASH_FLOW).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </Field>

              <Field label="تاريخ سريان إعادة التصنيف" required>
                <input
                  type="date"
                  className="input font-mono"
                  value={reclassForm.effectiveFrom}
                  onChange={(e) => setReclassForm({ ...reclassForm, effectiveFrom: e.target.value })}
                />
              </Field>

              {reclassForm.statementSection === 'EQUITY' && (
                <Field label="بند قائمة التغيرات في حقوق الملكية" className="sm:col-span-2">
                  <select
                    className="input"
                    value={reclassForm.equityLineId}
                    onChange={(e) => setReclassForm({ ...reclassForm, equityLineId: e.target.value })}
                  >
                    <option value="">— تلقائي —</option>
                    {statementLines
                      .filter((s) => s.statementType === 'EQUITY_CHANGES')
                      .map((s) => (
                        <option key={s.id} value={s.id}>[{s.code}] {s.nameAr}</option>
                      ))}
                  </select>
                </Field>
              )}

              <Field label="المبرر المحاسبي للتعديل (إلزامي للتدقيق)" required className="sm:col-span-2">
                <textarea
                  className="input h-20 py-2"
                  placeholder="مثال: إعادة تصنيف الحساب ضمن الالتزامات طويلة الأجل وفق معايير العرض IFRS / SOCPA..."
                  value={reclassForm.reason}
                  onChange={(e) => setReclassForm({ ...reclassForm, reason: e.target.value })}
                />
              </Field>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
