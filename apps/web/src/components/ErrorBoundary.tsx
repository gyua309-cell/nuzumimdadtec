import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertOctagon, Home, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public override state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    // Log error to console for diagnostics
    console.error('[ErrorBoundary caught error]:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    this.props.onReset?.();
  };

  public override render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[400px] w-full items-center justify-center p-6 animate-fade-in">
          <div className="w-full max-w-xl rounded-2xl border border-rose-200 bg-white p-6 shadow-xl dark:border-rose-900/60 dark:bg-slate-900 text-slate-800 dark:text-slate-100">
            <div className="flex items-center gap-3 border-b border-rose-100 pb-4 dark:border-rose-900/40">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400">
                <AlertOctagon className="size-6" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  {this.props.fallbackTitle || 'تعذر عرض محتوى هذه الصفحة'}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  حدث خطأ غير متوقع في واجهة المستخدم، وتم احتواؤه لمنع توقف بقية النظام.
                </p>
              </div>
            </div>

            <div className="my-4 space-y-2">
              <div className="rounded-xl bg-rose-50/50 p-3 text-xs text-rose-800 dark:bg-rose-950/30 dark:text-rose-300 font-mono break-all">
                {this.state.error?.message || 'خطأ غير معروف في واجهة العرض'}
              </div>

              {this.state.error?.stack && (
                <details className="text-xs text-slate-500">
                  <summary className="cursor-pointer font-semibold hover:text-slate-700 dark:hover:text-slate-300">
                    عرض التفاصيل الفنية وتتبع الكود (Stack Trace)
                  </summary>
                  <pre className="mt-2 max-h-44 overflow-auto rounded-lg bg-slate-950 p-3 text-[11px] text-slate-200 font-mono text-left" dir="ltr">
                    {this.state.error.stack}
                  </pre>
                </details>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={this.handleReset}
                className="btn-primary text-xs flex items-center gap-1.5"
              >
                <RefreshCw className="size-3.5" /> إعادة المحاولة
              </button>

              <button
                type="button"
                onClick={() => window.location.reload()}
                className="btn-secondary text-xs flex items-center gap-1.5"
              >
                تحديث الصفحة بالكامل
              </button>

              <a
                href="#/"
                onClick={this.handleReset}
                className="btn-ghost text-xs ms-auto flex items-center gap-1.5 text-slate-600 dark:text-slate-300 hover:text-brand-600"
              >
                <Home className="size-3.5" /> العودة للوحة المؤشرات
              </a>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
