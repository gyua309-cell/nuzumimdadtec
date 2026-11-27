import { ReactNode } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import { ActionButton, ActionGroup } from './ui';

export interface RowActionBarProps {
  onView?: () => void;
  viewTitle?: string;
  onPreview?: () => void;
  previewTitle?: string;
  onPrint?: () => void;
  printTitle?: string;
  onPdf?: () => void;
  pdfTitle?: string;
  onExcel?: () => void;
  excelTitle?: string;
  onEdit?: () => void;
  editTitle?: string;
  editDisabled?: boolean;
  onDelete?: () => void;
  deleteTitle?: string;
  deleteDisabled?: boolean;
  extra?: ReactNode;
  className?: string;
}

/**
 * Unified ERP operational action bar rendered cleanly inside table rows and detail headers.
 */
export function RowActionBar({
  onView,
  viewTitle = 'عرض التفاصيل',
  onPreview,
  previewTitle = 'معاينة قبل الطباعة (A4)',
  onPrint,
  printTitle = 'طباعة رسمية (A4)',
  onPdf,
  pdfTitle = 'تصدير PDF مباشر',
  onExcel,
  excelTitle = 'تصدير Excel',
  onEdit,
  editTitle = 'تعديل',
  editDisabled = false,
  onDelete,
  deleteTitle = 'حذف / إلغاء',
  deleteDisabled = false,
  extra,
  className = '',
}: RowActionBarProps) {
  return (
    <ActionGroup className={className}>
      {extra}
      {onView && <ActionButton variant="view" title={viewTitle} onClick={onView} />}
      {onPreview && <ActionButton variant="preview" title={previewTitle} onClick={onPreview} />}
      {onPrint && <ActionButton variant="print" title={printTitle} onClick={onPrint} />}
      {onPdf && <ActionButton variant="pdf" title={pdfTitle} onClick={onPdf} />}
      {onExcel && (
        <ActionButton
          variant="custom"
          title={excelTitle}
          onClick={onExcel}
          className="text-emerald-700 bg-emerald-500/10 border-emerald-300/70 hover:bg-emerald-600 hover:text-white hover:border-emerald-600 dark:text-emerald-300 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:hover:bg-emerald-600 dark:hover:text-white"
        >
          <FileSpreadsheet className="size-3.5 stroke-[2.2]" />
        </ActionButton>
      )}
      {onEdit && (
        <ActionButton
          variant="edit"
          title={editTitle}
          onClick={onEdit}
          disabled={editDisabled}
        />
      )}
      {onDelete && (
        <ActionButton
          variant="delete"
          title={deleteTitle}
          onClick={onDelete}
          disabled={deleteDisabled}
        />
      )}
    </ActionGroup>
  );
}
