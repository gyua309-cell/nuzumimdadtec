import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'idham:isPublic';
export const PERMISSIONS = 'idham:permissions';
export const NO_COMPANY = 'idham:noCompany';

/** Route does not require authentication. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Route requires ALL listed permission codes in the active company. */
export const RequirePermission = (...codes: string[]) => SetMetadata(PERMISSIONS, codes);

/** Authenticated route that does not need an active company (X-Company-Id). */
export const NoCompany = () => SetMetadata(NO_COMPANY, true);
