import { AsyncLocalStorage } from 'async_hooks';
import type { PoolClient } from 'pg';

/** Per-request context propagated through async calls. */
export interface RequestContext {
  requestId: string;
  userId?: string;
  username?: string;
  companyId?: string;
  isSystemAdmin?: boolean;
  /** Effective permission codes for the active company. */
  permissions?: Set<string>;
  /** Branch scopes: null = all branches; otherwise allowed branch ids. */
  branchScope?: string[] | null;
  ip?: string;
  device?: string;
}

/** Active database transaction (if any) for the current async flow. */
export interface TxState {
  client: PoolClient;
  reason?: string;
  afterCommit: Array<() => Promise<void> | void>;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();
export const txContext = new AsyncLocalStorage<TxState>();

export function currentContext(): RequestContext | undefined {
  return requestContext.getStore();
}

export function currentUserId(): string | undefined {
  return requestContext.getStore()?.userId;
}
