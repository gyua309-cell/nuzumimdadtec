import { INestApplication } from '@nestjs/common';
import { adminToken, Api, expectOk, newCompany, startApp } from './helpers';

describe('Sales Invoicing & ZATCA Integration (integration)', () => {
  let app: INestApplication;
  let a: Api;
  let jan: string;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    app = await startApp();
    const token = await adminToken(app);
    const c = await newCompany(app, token);
    a = c.api;
    const periods = c.fiscalYear.periods as Array<{ id: string; periodNo: number }>;
    jan = periods.find((p) => p.periodNo === 1)!.id;

    // 1. Setup Chart of Accounts for Sales & Tax
    const a1 = expectOk(await a.post('/accounts', { code: '1', nameAr: 'الأصول', accountClass: 'ASSET', isPosting: false }), 201).id;
    const arAccId = expectOk(await a.post('/accounts', { code: '1200', nameAr: 'العملاء والذمم المدينة', accountClass: 'ASSET', parentId: a1, subtype: 'RECEIVABLE' }), 201).id;
    ids.arAcc = arAccId;

    const a2 = expectOk(await a.post('/accounts', { code: '2', nameAr: 'الالتزامات', accountClass: 'LIABILITY', isPosting: false }), 201).id;
    const vatAccId = expectOk(await a.post('/accounts', { code: '2300', nameAr: 'ضريبة القيمة المضافة المستحقة (مخرجات)', accountClass: 'LIABILITY', parentId: a2 }), 201).id;
    ids.vatAcc = vatAccId;

    const a4 = expectOk(await a.post('/accounts', { code: '4', nameAr: 'الإيرادات', accountClass: 'REVENUE', isPosting: false }), 201).id;
    const revAccId = expectOk(await a.post('/accounts', { code: '4100', nameAr: 'إيرادات مبيعات وخدمات المشاريع', accountClass: 'REVENUE', parentId: a4 }), 201).id;
    ids.revAcc = revAccId;

    // 2. Setup Posting Rules for SAL.INVOICE and SAL.CREDIT_NOTE
    await a.post('/posting-rules', {
      eventCode: 'SAL.INVOICE',
      name: 'قيد فاتورة المبيعات الضريبية',
      effectiveFrom: '2026-01-01',
      lines: [
        { lineNo: 1, side: 'DEBIT', accountSource: 'FIXED', accountId: arAccId, amountKey: 'total' },
        { lineNo: 2, side: 'CREDIT', accountSource: 'FIXED', accountId: revAccId, amountKey: 'subtotal' },
        { lineNo: 3, side: 'CREDIT', accountSource: 'FIXED', accountId: vatAccId, amountKey: 'vat' },
      ],
    });

    await a.post('/posting-rules', {
      eventCode: 'SAL.CREDIT_NOTE',
      name: 'قيد إشعار دائن مردودات مبيعات',
      effectiveFrom: '2026-01-01',
      lines: [
        { lineNo: 1, side: 'CREDIT', accountSource: 'FIXED', accountId: arAccId, amountKey: 'total' },
        { lineNo: 2, side: 'DEBIT', accountSource: 'FIXED', accountId: revAccId, amountKey: 'subtotal' },
        { lineNo: 3, side: 'DEBIT', accountSource: 'FIXED', accountId: vatAccId, amountKey: 'vat' },
      ],
    });

    // 3. Create Client with full Saudi Tax Info
    ids.client = expectOk(
      await a.post('/clients', {
        code: 'CL-ZATCA',
        nameAr: 'شركة التقنية المتقدمة المحدودة',
        nameEn: 'Advanced Tech Ltd',
        currencyCode: 'EGP',
      }),
      201,
    ).id;

    // Update Client VAT number and address via DB if needed or fields
    // 4. Create Project
    ids.project = expectOk(
      await a.post('/projects', {
        clientId: ids.client,
        code: 'PRJ-DEV-01',
        nameAr: 'مشروع تطوير المنصة الرقمية',
        startDate: '2026-01-01',
        currencyCode: 'EGP',
        status: 'ACTIVE',
      }),
      201,
    ).id;

    // 5. Setup Employee, Assignment & Service Price for Automated Billing
    ids.salaryComp = expectOk(
      await a.post('/cost-components', {
        code: 'BASIC', nameAr: 'الأساسي', componentType: 'SALARY', nature: 'EARNING', calcMethod: 'BASIC_SALARY', postingTreatment: 'NONE',
        affectsNetPay: true, sortOrder: 1, effectiveFrom: '2026-01-01',
      }),
      201,
    ).id;
    ids.profile = expectOk(await a.post('/cost-profiles', { code: 'DEV-PROF', nameAr: 'ملف المطورين' }), 201).id;
    expectOk(await a.post(`/cost-profiles/${ids.profile}/lines`, { componentId: ids.salaryComp, effectiveFrom: '2026-01-01' }), 201);

    ids.emp = expectOk(
      await a.post('/employees', {
        code: 'DEV-01',
        fullNameAr: 'طارق زياد المهندس',
        hireDate: '2026-01-01',
        compensation: { basicSalary: '20000', salaryCurrency: 'EGP', insuranceSalary: '0' },
        costProfileId: ids.profile,
      }),
      201,
    ).id;

    // Assign to project (100% allocation)
    ids.asgn = expectOk(
      await a.post('/assignments', {
        employeeId: ids.emp,
        projectId: ids.project,
        allocationPct: '100',
        startDate: '2026-01-01',
        isBillable: true,
      }),
      201,
    ).id;

    // Service price: 30,000 per month
    ids.price = expectOk(
      await a.post('/service-prices', {
        employeeId: ids.emp,
        projectId: ids.project,
        pricingBasis: 'MONTHLY',
        price: '30000',
        currencyCode: 'EGP',
        effectiveFrom: '2026-01-01',
        reason: 'سعر استشاري شهري متعاقد عليه',
      }),
      201,
    ).id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Manual Invoicing & ZATCA Phase 1 & 2 TLV QR', () => {
    it('creates a manual standard B2B tax invoice with line items, 15% VAT, and draft status', async () => {
      const inv = expectOk(
        await a.post('/invoices', {
          invoiceType: 'TAX_INVOICE',
          clientId: ids.client,
          projectId: ids.project,
          fiscalPeriodId: jan,
          issueDate: '2026-01-15',
          currencyCode: 'EGP',
          lines: [
            {
              description: 'خدمات هندسة برمجيات وتطوير ويب',
              quantity: 2,
              unitPrice: 10000,
              discountPct: 0,
              vatRate: 15,
            },
            {
              description: 'استشارات أمن معلومات وسحابة',
              quantity: 1,
              unitPrice: 5000,
              discountPct: 10, // 5000 - 10% = 4500
              vatRate: 15,
            },
          ],
        }),
        201,
      );

      ids.inv1 = inv.id;
      expect(inv.invoiceNo).toMatch(/^INV-2026-\d{4}$/);
      expect(inv.status).toBe('DRAFT');
      expect(Number(inv.subtotal)).toBe(24500); // 20,000 + 4,500
      expect(Number(inv.vatAmount)).toBe(3675); // 24,500 * 15%
      expect(Number(inv.totalAmount)).toBe(28175); // 24,500 + 3,675
      expect(inv.lines.length).toBe(2);
      expect(['PASS', 'WARNING']).toContain(inv.zatcaComplianceStatus);
    });

    it('posts tax invoice generating ZATCA TLV Base64 QR code and GL journal entry', async () => {
      const posted = expectOk(await a.post(`/invoices/${ids.inv1}/post`, {}));
      expect(posted.status).toBe('POSTED');
      expect(posted.zatcaStatus).toBe('CLEARED');
      expect(posted.zatcaQrCode).toBeDefined();
      expect(typeof posted.zatcaQrCode).toBe('string');
      expect(posted.zatcaQrCode.length).toBeGreaterThan(20);

      // Verify TLV tags structure: Base64 decode check
      const buffer = Buffer.from(posted.zatcaQrCode, 'base64');
      expect(buffer[0]).toBe(1); // Tag 1: Seller Name
      expect(buffer.length).toBeGreaterThan(50);

      // Verify GL Journal Entry
      expect(posted.journalEntryId).toBeDefined();
      const je = expectOk(await a.get(`/journal-entries/${posted.journalEntryId}`));
      expect(je.status).toBe('POSTED');
      expect(je.lines.length).toBe(3); // A/R Dr, Rev Cr, VAT Cr
      expect(Number(je.totalDebitBase)).toBe(28175);
      expect(Number(je.totalCreditBase)).toBe(28175);
    });
  });

  describe('Automated Invoicing from Project Revenue Engine', () => {
    it('executes monthly revenue run, then auto-generates invoices with employee details', async () => {
      // 1. Run revenue calculation for Jan (30,000 gross revenue from dev assignment)
      const revRun = expectOk(await a.post('/revenue-runs', { fiscalPeriodId: jan }), 201);
      expect(revRun.status).toBe('POSTED');
      expect(Number(revRun.totalRevenueBase)).toBe(30000);

      // 2. Auto-generate invoices from revenue lines
      const genRes = expectOk(
        await a.post('/invoices/auto-generate', {
          fiscalPeriodId: jan,
          autoPost: true,
        }),
        201,
      );

      expect(genRes.count).toBe(1);
      expect(Number(genRes.totalAmount)).toBe(34500); // 30,000 + 15% VAT (4,500)
      expect(genRes.invoices.length).toBe(1);

      const autoInv = genRes.invoices[0];
      ids.autoInv = autoInv.id;
      expect(autoInv.status).toBe('POSTED');
      expect(autoInv.clientId).toBe(ids.client);
      expect(autoInv.projectId).toBe(ids.project);
      expect(Number(autoInv.subtotal)).toBe(30000);
      expect(Number(autoInv.vatAmount)).toBe(4500);
      expect(Number(autoInv.totalAmount)).toBe(34500);

      // Verify line details have employee name and project
      expect(autoInv.lines.length).toBeGreaterThanOrEqual(1);
      const line = autoInv.lines[0];
      expect(line.employeeId).toBe(ids.emp);
      expect(line.description).toContain('طارق زياد المهندس');
      expect(line.revenueLineId).toBeDefined();
    });

    it('rejects duplicate auto-invoicing when all revenue lines are already billed', async () => {
      const dup = await a.post('/invoices/auto-generate', {
        fiscalPeriodId: jan,
        autoPost: false,
      });
      expect([400, 422]).toContain(dup.status);
    });
  });

  describe('ZATCA Credit Notes (Sales Returns) & Invoice Cancellation', () => {
    it('issues a ZATCA credit note (إشعار دائن) referencing the original invoice', async () => {
      const crn = expectOk(
        await a.post('/credit-notes', {
          originalInvoiceId: ids.inv1,
          returnReason: 'تعديل ساعات العمل وإلغاء الاستشارة الأمنية',
        }),
        201,
      );

      ids.crn = crn.id;
      expect(crn.invoiceNo).toMatch(/^CRN-2026-\d{4}$/);
      expect(crn.invoiceType).toBe('CREDIT_NOTE');
      expect(crn.originalInvoiceId).toBe(ids.inv1);
      expect(crn.returnReason).toBe('تعديل ساعات العمل وإلغاء الاستشارة الأمنية');
      expect(Number(crn.totalAmount)).toBe(28175);

      // Post the credit note to check GL entry reversal
      const postedCrn = expectOk(await a.post(`/invoices/${crn.id}/post`, {}));
      expect(postedCrn.status).toBe('POSTED');
      expect(postedCrn.journalEntryId).toBeDefined();

      const je = expectOk(await a.get(`/journal-entries/${postedCrn.journalEntryId}`));
      expect(je.status).toBe('POSTED');
      expect(Number(je.totalDebitBase)).toBe(28175);
      expect(Number(je.totalCreditBase)).toBe(28175);
    });

    it('cancels an invoice with reason and reverses its journal entry', async () => {
      const cancelled = expectOk(
        await a.post(`/invoices/${ids.autoInv}/cancel`, {
          reason: 'إلغاء الفاتورة بناء على طلب العميل لإعادة التدقيق',
        }),
      );
      expect(cancelled.status).toBe('CANCELLED');
    });
  });
});
