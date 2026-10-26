import { HttpStatus, UnauthorizedException } from '@nestjs/common';
import { currentContext } from '../context';
import { DomainError, ForbiddenError } from '../errors';

/** Active company resolved by the AuthGuard from the X-Company-Id header. */
export function activeCompanyId(): string {
  const id = currentContext()?.companyId;
  if (!id) throw new DomainError('COMPANY_REQUIRED', 'X-Company-Id header is required', HttpStatus.BAD_REQUEST);
  return id;
}

export function activeUserId(): string {
  const id = currentContext()?.userId;
  if (!id) throw new UnauthorizedException({ code: 'UNAUTHENTICATED' });
  return id;
}

export function hasPermission(code: string): boolean {
  const ctx = currentContext();
  return !!ctx?.isSystemAdmin || !!ctx?.permissions?.has(code);
}

export function assertPermission(code: string): void {
  if (!hasPermission(code)) throw new ForbiddenError('FORBIDDEN', `Missing permission: ${code}`);
}

export function assertSystemAdmin(): void {
  if (!currentContext()?.isSystemAdmin) throw new ForbiddenError('FORBIDDEN', 'System administrator only');
}
