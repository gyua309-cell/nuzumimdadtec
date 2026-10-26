import { z } from 'zod';

/** Common request schemas & helpers shared by controllers. */
export const uuid = z.string().uuid();
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');
/** Decimal amount as string or number -> normalized string; rejects NaN/Infinity. */
export const decimalString = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim())
  .refine((v) => /^-?\d{1,16}(\.\d{1,10})?$/.test(v), 'Invalid decimal number');
export const positiveDecimal = decimalString.refine((v) => Number(v) > 0, 'Must be greater than zero');
export const nonNegativeDecimal = decimalString.refine((v) => !v.startsWith('-'), 'Must not be negative');
export const reasonSchema = z.object({ reason: z.string().trim().min(3, 'Reason is required').max(1000) });

export const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  q: z.string().trim().max(200).optional(),
  sort: z.string().trim().max(60).optional(),
});
export type ListQuery = z.infer<typeof listQuery>;

export interface Page<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number };
}

/**
 * Builds a safe ORDER BY from a whitelist: `sort=-entry_date` => "entry_date DESC".
 * Never interpolates user input that is not whitelisted (SQL injection protection).
 */
export function orderBy(sort: string | undefined, allowed: Record<string, string>, fallback: string): string {
  if (!sort) return fallback;
  const desc = sort.startsWith('-');
  const key = desc ? sort.slice(1) : sort;
  const col = allowed[key];
  if (!col) return fallback;
  return `${col} ${desc ? 'DESC' : 'ASC'}`;
}

export function offset(q: { page: number; pageSize: number }): number {
  return (q.page - 1) * q.pageSize;
}
