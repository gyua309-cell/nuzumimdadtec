import { Global, Module } from '@nestjs/common';
import { AccountsService } from './application/accounts.service';
import { BankTransfersService } from './application/bank-transfers.service';
import { CloseCheckRegistry, ClosingService } from './application/closing.service';
import { CostCentersReportService } from './application/cost-centers-report.service';
import { JournalService } from './application/journal.service';
import { LedgerService } from './application/ledger.service';
import { AccountResolverRegistry, PostingEngine } from './application/posting-engine';
import { PostingRulesService } from './application/posting-rules.service';
import { SyncJournalsService } from './application/sync-journals.service';
import {
  AccountingSyncController,
  AccountsController,
  AuditController,
  BankAccountsController,
  BankTransfersController,
  bankAccountRepoProvider,
  ClosingController,
  JournalController,
  LedgerController,
  PostingRulesController,
  StatementLinesController,
} from './presentation/accounting.controllers';
import { ReportsController } from './presentation/reports.controller';

/**
 * Accounting engine. Global so that every business module can post through the
 * PostingEngine and register account resolvers / close checks.
 */
@Global()
@Module({
  controllers: [
    AccountsController,
    StatementLinesController,
    BankAccountsController,
    BankTransfersController,
    AccountingSyncController,
    PostingRulesController,
    JournalController,
    LedgerController,
    ReportsController,
    ClosingController,
    AuditController,
  ],
  providers: [
    AccountsService,
    BankTransfersService,
    JournalService,
    SyncJournalsService,
    PostingRulesService,
    AccountResolverRegistry,
    PostingEngine,
    LedgerService,
    CostCentersReportService,
    CloseCheckRegistry,
    ClosingService,
    bankAccountRepoProvider,
  ],
  exports: [AccountsService, BankTransfersService, JournalService, SyncJournalsService, PostingRulesService, AccountResolverRegistry, PostingEngine, LedgerService, CostCentersReportService, CloseCheckRegistry, ClosingService],
})
export class AccountingModule {}
