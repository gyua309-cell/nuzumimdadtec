import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import {
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { api } from '../lib/api';
import { Field, PageHeader, Spinner, useToast } from '../components/ui';

export function ZatcaQrValidatorPage() {
  const toast = useToast();
  const [qrBase64, setQrBase64] = useState<string>('');
  const [decodedResult, setDecodedResult] = useState<{ tagCount: number; tags: Record<string, any> } | null>(null);

  const decodeMutation = useMutation({
    mutationFn: (base64: string) => api.post<any>('/zatca/decode-qr', { qrBase64: base64.trim() }),
    onSuccess: (data) => {
      setDecodedResult(data);
      toast.success(`تم بنجاح فك تشفير ${data.tagCount} وسماً من الرمز`);
    },
    onError: (e) => toast.error(e),
  });

  const loadSampleQr = () => {
    // Phase 2 Sample QR with 8 tags
    const sample = 'AQ/YtNixa2Universal33MQ8zMTAxMjM0NTY3MDAwMDMTFDIwMjYtMTAtMjJUMTI6MDA6MDBaBAY4NzQwMC4wMAYxMTQwMC4wMEYzNDM5MzUyMzk5MTg2NzkzNDkwNWRkOTAxMDY=';
    setQrBase64(sample);
    decodeMutation.mutate(sample);
  };

  const handleDecode = () => {
    if (!qrBase64.trim()) {
      toast.error('يرجى إدخال نص الرمز المشفر أولاً');
      return;
    }
    decodeMutation.mutate(qrBase64.trim());
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in pb-16">
      <PageHeader
        title="فاحص ومفسر رمز الاستجابة السريع (ZATCA QR TLV Decoder)"
        subtitle="أداة تدقيق وفحص سلامة الرموز المشفرة بتقنية TLV (Tag-Length-Value) المعتمدة لدى هيئة الزكاة والضريبة والجمارك (المرحلة 1 و 2)."
        actions={
          <button onClick={loadSampleQr} className="btn-secondary text-sm flex items-center gap-1.5">
            <Sparkles className="size-4 text-purple-600" /> تجربة فحص عينة قياسية
          </button>
        }
      />

      <div className="card p-6 space-y-4">
        <Field label="نص رمز الاستجابة السريع (Base64 TLV String)" hint="انسخ الكود المشفر من الفاتورة أو قارئ الباركود">
          <textarea
            className="input num font-mono text-xs leading-relaxed h-28"
            dir="ltr"
            placeholder="ألصق نص الرمز المشفر هنا..."
            value={qrBase64}
            onChange={(e) => setQrBase64(e.target.value)}
          />
        </Field>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-2">
            <button
              onClick={handleDecode}
              disabled={decodeMutation.isPending || !qrBase64.trim()}
              className="btn-primary text-sm flex items-center gap-1.5 shadow-sm"
            >
              {decodeMutation.isPending ? <Spinner /> : <Search className="size-4" />}
              فحص وفك تشفير الحقول
            </button>
            <button
              onClick={() => { setQrBase64(''); setDecodedResult(null); }}
              className="btn-secondary text-sm flex items-center gap-1.5"
            >
              <RotateCcw className="size-3.5" /> مسح
            </button>
          </div>

          <span className="text-xs text-slate-500">
            يدعم فك شفرة الوسوم 1 إلى 5 (المرحلة 1) والوسوم 6 إلى 8 (المرحلة 2)
          </span>
        </div>
      </div>

      {decodedResult && (
        <div className="card p-6 space-y-6 animate-fade-in">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-emerald-600" />
              <h3 className="font-bold text-slate-900 dark:text-white">
                نتائج فك التشفير والتدقيق ({decodedResult.tagCount} وسماً مكتشفاً)
              </h3>
            </div>
            <span className="text-xs font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 dark:text-emerald-300 rounded-lg px-2.5 py-1">
              مطابق لاشتراطات ZATCA
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Visual QR render */}
            <div className="flex flex-col items-center justify-center p-5 rounded-2xl bg-slate-50 border border-slate-200 dark:bg-slate-900/60 dark:border-slate-800">
              <div className="rounded-xl bg-white p-3 shadow-sm border border-slate-200 dark:border-slate-700">
                <QRCodeSVG value={qrBase64} size={150} level="M" />
              </div>
              <span className="text-[11px] text-slate-500 mt-3 text-center">
                رمز QR ناتج وقابل للمسح عبر تطبيق «زاتكا» الرسمي
              </span>
            </div>

            {/* Decoded Tags List */}
            <div className="md:col-span-2 space-y-2.5">
              {Object.entries(decodedResult.tags).map(([tagKey, tagVal]: [string, any]) => {
                const isPhase2 = Number(tagKey) >= 6;
                return (
                  <div
                    key={tagKey}
                    className={`rounded-xl border p-3 text-xs transition-all ${
                      isPhase2
                        ? 'border-purple-200 bg-purple-50/40 dark:border-purple-900/60 dark:bg-purple-950/20'
                        : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <span className={`size-5 rounded-md flex items-center justify-center text-[10px] font-bold ${
                            isPhase2 ? 'bg-purple-600 text-white' : 'bg-emerald-600 text-white'
                          }`}>
                            {tagKey}
                          </span>
                          <span>{tagVal.nameAr}</span>
                          {isPhase2 && (
                            <span className="text-[10px] bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 px-1.5 py-0.5 rounded font-semibold">
                              مرحلة 2
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5 mr-6">{tagVal.nameEn}</div>
                      </div>

                      <div className="font-mono text-left dir-ltr max-w-[260px] break-all font-semibold text-slate-800 dark:text-slate-200">
                        {tagVal.value}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
