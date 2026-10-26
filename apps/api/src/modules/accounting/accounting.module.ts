import { Global, Module } from '@nestjs/common';
import { AccountsService } from './application/accounts.service';
import { CloseCheckRegistry, ClosingService } from './application/closing.service';
import { JournalService } from './application/journal.service';
import { LedgerService } from './application/ledger.service';
import { AccountResolverRegistry, PostingEngine } from './application/posting-engine';
import { PostingRulesService } from './application/posting-rules.service';
import {
  AccountsController,
  AuditController,
  BankAccountsController,
  bankAccountRepoProvider,
  ClosingController,
  JournalController,
  LedgerController,
  PostingRulesController,
} from './presentation/accounting.controllers';

/**
 * Accounting engine. Global so that every business module can post through the
 * PostingEngine and register account resolvers / close checks.
 */
@Global()
@Module({
  controllers: [
    AccountsController,
    BankAccountsController,
    PostingRulesController,
    JournalController,
    LedgerController,
    ClosingController,
    AuditController,
  ],
  providers: [
    AccountsService,
    JournalService,
    PostingRulesService,
    AccountResolverRegistry,
    PostingEngine,
    LedgerService,
    CloseCheckRegistry,
    ClosingService,
    bankAccountRepoProvider,
  ],
  exports: [AccountsService, JournalService, PostingRulesService, AccountResolverRegistry, PostingEngine, LedgerService, CloseCheckRegistry, ClosingService],
})
export class AccountingModule {}
