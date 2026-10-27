import { Injectable } from '@nestjs/common';
import { DbService } from '../../../infrastructure/db/db.service';
import { NotFoundError } from '../../../shared/errors';

export interface ServiceDto {
  id?: string;
  code: string;
  nameAr: string;
  nameEn?: string;
  category: string;
  billingBasis: string;
  defaultUnitPrice: number | string;
  currencyCode?: string;
  vatRate?: number | string;
  glAccountId?: string;
  description?: string;
  isActive?: boolean;
}

@Injectable()
export class ServicesCatalogService {
  constructor(private readonly db: DbService) {}

  async list(companyId: string) {
    const rows = await this.db.query(
      `SELECT 
        id,
        code,
        name_ar as "nameAr",
        name_en as "nameEn",
        category,
        billing_basis as "billingBasis",
        standard_unit_price as "defaultUnitPrice",
        currency_code as "currencyCode",
        vat_rate as "vatRate",
        gl_account_id as "glAccountId",
        description,
        is_active as "isActive",
        created_at as "createdAt",
        updated_at as "updatedAt"
       FROM sal.services 
       WHERE company_id = $1 
       ORDER BY code ASC`,
      [companyId]
    );
    return rows;
  }

  async get(companyId: string, id: string) {
    const rows = await this.db.query(
      `SELECT 
        id,
        code,
        name_ar as "nameAr",
        name_en as "nameEn",
        category,
        billing_basis as "billingBasis",
        standard_unit_price as "defaultUnitPrice",
        currency_code as "currencyCode",
        vat_rate as "vatRate",
        gl_account_id as "glAccountId",
        description,
        is_active as "isActive",
        created_at as "createdAt",
        updated_at as "updatedAt"
       FROM sal.services 
       WHERE company_id = $1 AND id = $2`,
      [companyId, id]
    );
    if (rows.length === 0) throw new NotFoundError('الخدمة المطلوبة غير موجودة');
    return rows[0];
  }

  async create(companyId: string, dto: ServiceDto) {
    const rows = await this.db.query(
      `INSERT INTO sal.services (
        company_id, code, name_ar, name_en, category, billing_basis, 
        standard_unit_price, currency_code, vat_rate, gl_account_id, description, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING 
        id,
        code,
        name_ar as "nameAr",
        name_en as "nameEn",
        category,
        billing_basis as "billingBasis",
        standard_unit_price as "defaultUnitPrice",
        currency_code as "currencyCode",
        vat_rate as "vatRate",
        gl_account_id as "glAccountId",
        description,
        is_active as "isActive",
        created_at as "createdAt",
        updated_at as "updatedAt"`,
      [
        companyId,
        dto.code,
        dto.nameAr,
        dto.nameEn || null,
        dto.category || 'other',
        dto.billingBasis || 'monthly',
        dto.defaultUnitPrice || 0,
        dto.currencyCode || 'SAR',
        dto.vatRate || 15,
        dto.glAccountId || null,
        dto.description || null,
        dto.isActive !== undefined ? dto.isActive : true,
      ]
    );
    return rows[0];
  }

  async update(companyId: string, id: string, dto: Partial<ServiceDto>) {
    await this.get(companyId, id);

    const rows = await this.db.query(
      `UPDATE sal.services SET
        code = COALESCE($3, code),
        name_ar = COALESCE($4, name_ar),
        name_en = COALESCE($5, name_en),
        category = COALESCE($6, category),
        billing_basis = COALESCE($7, billing_basis),
        standard_unit_price = COALESCE($8, standard_unit_price),
        currency_code = COALESCE($9, currency_code),
        vat_rate = COALESCE($10, vat_rate),
        gl_account_id = $11,
        description = COALESCE($12, description),
        is_active = COALESCE($13, is_active),
        updated_at = now()
       WHERE id = $1 AND company_id = $2
       RETURNING 
        id,
        code,
        name_ar as "nameAr",
        name_en as "nameEn",
        category,
        billing_basis as "billingBasis",
        standard_unit_price as "defaultUnitPrice",
        currency_code as "currencyCode",
        vat_rate as "vatRate",
        gl_account_id as "glAccountId",
        description,
        is_active as "isActive",
        created_at as "createdAt",
        updated_at as "updatedAt"`,
      [
        id,
        companyId,
        dto.code,
        dto.nameAr,
        dto.nameEn,
        dto.category,
        dto.billingBasis,
        dto.defaultUnitPrice,
        dto.currencyCode,
        dto.vatRate,
        dto.glAccountId !== undefined ? dto.glAccountId : null,
        dto.description,
        dto.isActive,
      ]
    );
    return rows[0];
  }

  async delete(companyId: string, id: string) {
    await this.get(companyId, id);
    await this.db.query('DELETE FROM sal.services WHERE id = $1 AND company_id = $2', [id, companyId]);
    return { success: true };
  }
}
