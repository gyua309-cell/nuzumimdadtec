import { Module, OnModuleInit } from '@nestjs/common';
import { DbService } from '../../infrastructure/db/db.service';
import { CloseCheckRegistry } from '../accounting/application/closing.service';
import { AccountResolverRegistry } from '../accounting/application/posting-engine';
import { AssetsService } from './application/assets.service';
import { DepreciationService } from './application/depreciation.service';
import { AssetCategoriesController, AssetsController, DepreciationController } from './presentation/assets.controllers';

/**
 * Fixed assets & depreciation. Account determination comes from the asset
 * category configuration; the period close is blocked while depreciation due
 * for the period has not been posted.
 */
@Module({
  controllers: [AssetCategoriesController, AssetsController, DepreciationController],
  providers: [AssetsService, DepreciationService],
  exports: [AssetsService, DepreciationService],
})
export class AssetsModule implements OnModuleInit {
  constructor(
    private readonly db: DbService,
    private readonly resolvers: AccountResolverRegistry,
    private readonly checks: CloseCheckRegistry,
    private readonly dep: DepreciationService,
  ) {}

  onModuleInit() {
    const fromCategory = (col: 'asset_account_id' | 'accum_account_id' | 'expense_account_id') => async (companyId: string, refs: Record<string, string | null | undefined>) => {
      if (!refs.assetCategoryId) return null;
      const r = await this.db.one<{ account_id: string }>(`SELECT ${col} AS account_id FROM ast.asset_categories WHERE company_id = $1 AND id = $2`, [
        companyId,
        refs.assetCategoryId,
      ]);
      return r?.account_id ?? null;
    };
    this.resolvers.register('FROM_ASSET_CATEGORY_ASSET', fromCategory('asset_account_id'));
    this.resolvers.register('FROM_ASSET_CATEGORY_ACCUM', fromCategory('accum_account_id'));
    this.resolvers.register('FROM_ASSET_CATEGORY_EXPENSE', fromCategory('expense_account_id'));

    this.checks.register({
      code: 'AST-01',
      titleAr: 'ترحيل إهلاك الأصول المستحق للفترة',
      order: 200,
      run: async (companyId, p) => {
        if (p.isAdjustmentPeriod) return { status: 'PASS' };
        const due = await this.dep.plan(companyId, p);
        if (!due.length) return { status: 'PASS' };
        return {
          status: 'FAIL',
          message: `يوجد إهلاك غير مرحّل لعدد ${new Set(due.map((d) => d.assetId)).size} أصل`,
          details: { assets: [...new Set(due.map((d) => d.assetNo))].slice(0, 50) },
        };
      },
    });
  }
}
