/**
 * IDHAM ERP - Unified Platform Adapter
 * Abstracts OS/Platform differences between Web (GitHub Pages / Cloud)
 * and Desktop (Tauri / Electron).
 */

export type PlatformType = 'web' | 'tauri' | 'electron';

export interface FileFilter {
  name: string;
  extensions: string[];
}

export interface SaveFileOptions {
  mimeType?: string;
  filters?: FileFilter[];
  defaultPath?: string;
}

export interface OpenFileResult {
  file: File;
  name: string;
  size: number;
  buffer: ArrayBuffer;
  text: string;
}

export interface PrintOptions {
  elementId?: string;
  contentHtml?: string;
  title?: string;
  silent?: boolean;
  printerName?: string;
  pageSize?: 'A4' | 'A5' | '80mm' | '58mm';
  orientation?: 'portrait' | 'landscape';
}

export interface IPlatformAdapter {
  readonly platform: PlatformType;
  readonly isDesktop: boolean;
  readonly canSilentPrint: boolean;

  saveFile(data: Blob | Uint8Array | string, filename: string, options?: SaveFileOptions): Promise<boolean>;
  openFile(options?: { accept?: string; filters?: FileFilter[] }): Promise<OpenFileResult | null>;
  printDocument(options: PrintOptions): Promise<void>;
  copyToClipboard(text: string): Promise<boolean>;
  openExternalUrl(url: string): void;
}

// -----------------------------------------------------------------------------
// Web / Browser Platform Adapter
// -----------------------------------------------------------------------------
export class WebPlatformAdapter implements IPlatformAdapter {
  readonly platform: PlatformType = 'web';
  readonly isDesktop: boolean = false;
  readonly canSilentPrint: boolean = false;

  async saveFile(data: Blob | Uint8Array | string, filename: string, options?: SaveFileOptions): Promise<boolean> {
    try {
      let blob: Blob;
      if (data instanceof Blob) {
        blob = data;
      } else if (typeof data === 'string') {
        blob = new Blob([data], { type: options?.mimeType || 'text/plain;charset=utf-8' });
      } else {
        const copy = new Uint8Array(data.byteLength);
        copy.set(data);
        blob = new Blob([copy.buffer], { type: options?.mimeType || 'application/octet-stream' });
      }

      // Modern Browser File System Access API (if available and HTTPS)
      if ('showSaveFilePicker' in window && window.isSecureContext) {
        try {
          const pickerOpts: any = {
            suggestedName: filename,
            types: options?.filters?.map((f) => ({
              description: f.name,
              accept: { [options.mimeType || 'application/octet-stream']: f.extensions.map((e) => `.${e}`) },
            })),
          };
          const handle = await (window as any).showSaveFilePicker(pickerOpts);
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
          return true;
        } catch (err: any) {
          if (err.name === 'AbortError') return false;
          // Fall back to standard anchor click download below
        }
      }

      // Standard browser download trigger
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 500);
      return true;
    } catch (e) {
      console.error('[WebPlatformAdapter] saveFile failed', e);
      return false;
    }
  }

  async openFile(options?: { accept?: string; filters?: FileFilter[] }): Promise<OpenFileResult | null> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept =
        options?.accept ||
        options?.filters?.flatMap((f) => f.extensions.map((e) => `.${e}`)).join(',') ||
        '*/*';

      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) {
          resolve(null);
          return;
        }
        try {
          const buffer = await file.arrayBuffer();
          const text = await file.text();
          resolve({
            file,
            name: file.name,
            size: file.size,
            buffer,
            text,
          });
        } catch {
          resolve(null);
        }
      };

      input.oncancel = () => resolve(null);
      input.click();
    });
  }

  async printDocument(options: PrintOptions): Promise<void> {
    let printTargetHtml = options.contentHtml || '';

    if (!printTargetHtml && options.elementId) {
      const el = document.getElementById(options.elementId);
      if (el) {
        printTargetHtml = el.outerHTML;
      }
    }

    // If an isolated HTML block is provided, print via an invisible iframe for clean output
    if (printTargetHtml) {
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.style.visibility = 'hidden';
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow?.document;
      if (!doc) {
        window.print();
        return;
      }

      // Copy stylesheet references into iframe
      const links = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
        .map((node) => node.outerHTML)
        .join('\n');

      const orientation = options.orientation || 'portrait';
      const pageSize = options.pageSize || 'A4';
      const sizeRule = pageSize.startsWith('80mm') || pageSize.startsWith('58mm')
        ? `${pageSize} auto`
        : `${pageSize} ${orientation}`;

      doc.open();
      doc.write(`
        <!doctype html>
        <html lang="ar" dir="rtl">
          <head>
            <meta charset="UTF-8" />
            <title>${options.title || document.title}</title>
            ${links}
            <style>
              @page {
                size: ${sizeRule};
                margin: ${pageSize.includes('mm') ? '3mm' : '8mm'};
              }
              body {
                margin: 0;
                padding: 0;
                background: #ffffff !important;
                color: #0f172a !important;
                font-family: 'IBM Plex Sans Arabic', system-ui, sans-serif !important;
                direction: rtl !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              * {
                box-sizing: border-box;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
            </style>
          </head>
          <body>
            ${printTargetHtml}
          </body>
        </html>
      `);
      doc.close();

      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => {
          document.body.removeChild(iframe);
        }, 1000);
      }, 350);
      return;
    }

    // Fallback: regular window.print()
    window.print();
  }

  async copyToClipboard(text: string): Promise<boolean> {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      return true;
    } catch {
      return false;
    }
  }

  openExternalUrl(url: string): void {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

// -----------------------------------------------------------------------------
// Desktop (Tauri / Electron) Platform Adapter
// -----------------------------------------------------------------------------
export class DesktopPlatformAdapter implements IPlatformAdapter {
  readonly platform: PlatformType;
  readonly isDesktop: boolean = true;
  readonly canSilentPrint: boolean = true;

  constructor(platform: 'tauri' | 'electron') {
    this.platform = platform;
  }

  async saveFile(data: Blob | Uint8Array | string, filename: string, options?: SaveFileOptions): Promise<boolean> {
    // If running in Tauri
    if (this.platform === 'tauri' && typeof (window as any).__TAURI__ !== 'undefined') {
      try {
        const { invoke } = (window as any).__TAURI__.core || (window as any).__TAURI__;
        let bytes: number[];
        if (data instanceof Blob) {
          bytes = Array.from(new Uint8Array(await data.arrayBuffer()));
        } else if (typeof data === 'string') {
          bytes = Array.from(new TextEncoder().encode(data));
        } else {
          bytes = Array.from(data);
        }
        await invoke('save_file_native', { filename, bytes, defaultPath: options?.defaultPath });
        return true;
      } catch (err) {
        console.warn('[DesktopPlatformAdapter] Tauri native save failed, falling back to Web adapter', err);
      }
    }

    // If running in Electron
    if (this.platform === 'electron' && typeof (window as any).electron !== 'undefined') {
      try {
        let bytes: Uint8Array;
        if (data instanceof Blob) {
          bytes = new Uint8Array(await data.arrayBuffer());
        } else if (typeof data === 'string') {
          bytes = new TextEncoder().encode(data);
        } else {
          bytes = data;
        }
        return await (window as any).electron.saveFile({ filename, data: bytes, options });
      } catch (err) {
        console.warn('[DesktopPlatformAdapter] Electron save failed, falling back', err);
      }
    }

    // Fallback to web implementation
    const fallback = new WebPlatformAdapter();
    return fallback.saveFile(data, filename, options);
  }

  async openFile(options?: { accept?: string; filters?: FileFilter[] }): Promise<OpenFileResult | null> {
    const fallback = new WebPlatformAdapter();
    return fallback.openFile(options);
  }

  async printDocument(options: PrintOptions): Promise<void> {
    // If Tauri provides silent / direct print hook
    if (this.platform === 'tauri' && typeof (window as any).__TAURI__ !== 'undefined') {
      try {
        const { invoke } = (window as any).__TAURI__.core || (window as any).__TAURI__;
        await invoke('print_document_native', options);
        return;
      } catch {
        // Fall back to web iframe print
      }
    }

    // If Electron provides native printToPDF / silent print
    if (this.platform === 'electron' && typeof (window as any).electron !== 'undefined') {
      try {
        await (window as any).electron.print(options);
        return;
      } catch {
        // Fall back
      }
    }

    const fallback = new WebPlatformAdapter();
    return fallback.printDocument(options);
  }

  async copyToClipboard(text: string): Promise<boolean> {
    const fallback = new WebPlatformAdapter();
    return fallback.copyToClipboard(text);
  }

  openExternalUrl(url: string): void {
    if (this.platform === 'tauri' && (window as any).__TAURI__?.shell?.open) {
      (window as any).__TAURI__.shell.open(url);
      return;
    }
    if (this.platform === 'electron' && (window as any).electron?.openExternal) {
      (window as any).electron.openExternal(url);
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

// -----------------------------------------------------------------------------
// Singleton Factory
// -----------------------------------------------------------------------------
let _adapterInstance: IPlatformAdapter | null = null;

export function getPlatformAdapter(): IPlatformAdapter {
  if (_adapterInstance) return _adapterInstance;

  if (typeof window !== 'undefined') {
    if ((window as any).__TAURI__) {
      _adapterInstance = new DesktopPlatformAdapter('tauri');
      return _adapterInstance;
    }
    if ((window as any).electron || (window as any).process?.type === 'renderer') {
      _adapterInstance = new DesktopPlatformAdapter('electron');
      return _adapterInstance;
    }
  }

  _adapterInstance = new WebPlatformAdapter();
  return _adapterInstance;
}
