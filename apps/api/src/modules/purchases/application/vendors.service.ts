import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { DbService } from '../../../infrastructure/db/db.service';
import { DomainError, NotFoundError } from '../../../shared/errors';
import { ListQuery, Page, offset, orderBy } from '../../../shared/http/common';

export const VendorCreate = z.object({
  code: z.string().trim().min(2).max(50),
  nameAr: z.string().trim().min(2).max(255),
  nameEn: z.string().trim().max(255).nullable().optional(),
  taxRegistrationNo: z.string().trim().length(15, 'الرقم الضريبي للمورد يجب أن يتكون من 15 رقماً').nullable().optional(),
  crNumber: z.string().trim().max(50).nullable().optional(),
  contactPerson: z.string().trim().max(150).nullable().optional(),
  email: z.string().trim().email().nullable().optional(),
  phone: z.string().trim().max(50).nullable().optional(),
  address: z.string().trim().max(500).nullable().optional(),
  currencyCode: z.string().trim().length(3).default('SAR'),
  paymentTermsDays: z.number().int().min(0).max(365).default(30),
  payableAccountId: z.string().uuid().nullable().optional(),
  defaultExpenseAccountId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().default(true),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export const VendorUpdate = VendorCreate.partial();

@Injectable()
export class VendorsService {
  constructor(private readonly db: DbService) {}

  async list(companyId: string, q: ListQuery): Promise<Page<any>> {
    const where = ['v.company_id = $1'];
    const params: unknown[] = [companyId];
    if (q.q) {
      params.push(`%${q.q}%`);
      where.push(`(v.code ILIKE $${params.length} OR v.name_ar ILIKE $${params.length} OR v.name_en ILIKE $${params.length} OR v.tax_registration_no ILIKE $${params.length})`);
    }
    const sql = where.join(' AND ');
    const total = await this.db.one<{ n: string }>(`SELECT count(*) AS n FROM pur.vendors v WHERE ${sql}`, params);
    const rows = await this.db.query(
      `SELECT v.id, v.code, v.name_ar AS "nameAr", v.name_en AS "nameEn",
              v.tax_registration_no AS "taxRegistrationNo", v.cr_number AS "crNumber",
              v.contact_person AS "contactPerson", v.email, v.phone, v.address,
              v.currency_code AS "currencyCode", v.payment_terms_days AS "paymentTermsDays",
              v.payable_account_id AS "payableAccountId", pa.name_ar AS "payableAccountName",
              v.default_expense_account_id AS "defaultExpenseAccountId", ea.name_ar AS "defaultExpenseAccountName",
              v.is_active AS "isActive", v.notes, v.created_at AS "createdAt"
         FROM pur.vendors v
         LEFT JOIN acc.accounts pa ON pa.id = v.payable_account_id
         LEFT JOIN acc.accounts ea ON ea.id = v.default_expense_account_id
        WHERE ${sql}
        ORDER BY ${orderBy(q.sort, { code: 'v.code', nameAr: 'v.name_ar' }, 'v.code ASC')}
        LIMIT ${q.pageSize} OFFSET ${offset(q)}`,
      params,
    );
    return { data: rows, meta: { page: q.page, pageSize: q.pageSize, total: Number(total?.n ?? 0) } };
  }

  async get(companyId: string, id: string) {
    const v = await this.db.one(
      `SELECT v.id, v.code, v.name_ar AS "nameAr", v.name_en AS "nameEn",
              v.tax_registration_no AS "taxRegistrationNo", v.cr_number AS "crNumber",
              v.contact_person AS "contactPerson", v.email, v.phone, v.address,
              v.currency_code AS "currencyCode", v.payment_terms_days AS "paymentTermsDays",
              v.payable_account_id AS "payableAccountId", pa.name_ar AS "payableAccountName",
              v.default_expense_account_id AS "defaultExpenseAccountId", ea.name_ar AS "defaultExpenseAccountName",
              v.is_active AS "isActive", v.notes, v.created_at AS "createdAt"
         FROM pur.vendors v
         LEFT JOIN acc.accounts pa ON pa.id = v.payable_account_id
         LEFT JOIN acc.accounts ea ON ea.id = v.default_expense_account_id
        WHERE v.company_id = $1 AND v.id = $2`,
      [companyId, id],
    );
    if (!v) throw new NotFoundError('VENDOR_NOT_FOUND', 'المورد غير موجود');
    return v;
  }

  async create(companyId: string, body: z.infer<typeof VendorCreate>) {
    // If payable account not supplied, find default 2300 (مستحقات الموردين)
    let payableId = body.payableAccountId;
    if (!payableId) {
      const defaultAp = await this.db.one<{ id: string }>(
        `SELECT id FROM acc.accounts WHERE company_id = $1 AND code = '2300'`,
        [companyId],
      );
      payableId = defaultAp?.id;
    }

    let expenseId = body.defaultExpenseAccountId;
    if (!expenseId) {
      const defaultExp = await this.db.one<{ id: string }>(
        `SELECT id FROM acc.accounts WHERE company_id = $1 AND code = '5500'`,
        [companyId],
      );
      expenseId = defaultExp?.id;
    }

    const row = await this.db.one(
      `INSERT INTO pur.vendors (
         company_id, code, name_ar, name_en, tax_registration_no, cr_number,
         contact_person, email, phone, address, currency_code, payment_terms_days,
         payable_account_id, default_expense_account_id, is_active, notes,
         created_by, updated_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,sys.current_user_id(),sys.current_user_id())
       RETURNING id`,
      [
        companyId, body.code, body.nameAr, body.nameEn ?? null,
        body.taxRegistrationNo ?? null, body.crNumber ?? null,
        body.contactPerson ?? null, body.email ?? null, body.phone ?? null,
        body.address ?? null, body.currencyCode, body.paymentTermsDays,
        payableId ?? null, expenseId ?? null, body.isActive, body.notes ?? null,
      ],
    );
    return this.get(companyId, row.id);
  }

  async update(companyId: string, id: string, body: z.infer<typeof VendorUpdate>) {
    await this.get(companyId, id);
    const sets: string[] = ['updated_at = now()', 'updated_by = sys.current_user_id()'];
    const params: unknown[] = [companyId, id];

    const mapping: Record<string, string> = {
      code: 'code',
      nameAr: 'name_ar',
      nameEn: 'name_en',
      taxRegistrationNo: 'tax_registration_no',
      crNumber: 'cr_number',
      contactPerson: 'contact_person',
      email: 'email',
      phone: 'phone',
      address: 'address',
      currencyCode: 'currency_code',
      paymentTermsDays: 'payment_terms_days',
      payableAccountId: 'payable_account_id',
      defaultExpenseAccountId: 'default_expense_account_id',
      isActive: 'is_active',
      notes: 'notes',
    };

    for (const [key, col] of Object.entries(mapping)) {
      if ((body as any)[key] !== undefined) {
        params.push((body as any)[key]);
        sets.push(`${col} = $${params.length}`);
      }
    }

    await this.db.query(
      `UPDATE pur.vendors SET ${sets.join(', ')} WHERE company_id = $1 AND id = $2`,
      params,
    );
    return this.get(companyId, id);
  }

  async delete(companyId: string, id: string) {
    const hasInvoices = await this.db.one<{ n: string }>(
      `SELECT count(*) AS n FROM pur.purchase_invoices WHERE company_id = $1 AND vendor_id = $2`,
      [companyId, id],
    );
    if (Number(hasInvoices?.n ?? 0) > 0) {
      throw new DomainError('VENDOR_HAS_INVOICES', 'لا يمكن حذف المورد لوجود فواتير مشتريات مسجلة له، يمكنك تعطيله بدلاً من حذفه');
    }
    await this.db.query(`DELETE FROM pur.vendors WHERE company_id = $1 AND id = $2`, [companyId, id]);
    return { ok: true };
  }
}
