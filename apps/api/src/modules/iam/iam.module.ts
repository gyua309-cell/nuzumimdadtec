import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard } from '@nestjs/throttler';
import { env } from '../../config/env';
import { AuthService } from './application/auth.service';
import { PermissionService } from './application/permission.service';
import { SetupService } from './application/setup.service';
import { UserAdminService } from './application/user-admin.service';
import { AuthGuard } from './presentation/auth.guard';
import { AuthController, SetupController, UsersController } from './presentation/iam.controllers';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: env().JWT_ACCESS_SECRET,
        signOptions: { algorithm: 'HS256', issuer: 'idham-erp', audience: 'idham-web' },
        verifyOptions: { algorithms: ['HS256'], issuer: 'idham-erp', audience: 'idham-web' },
      }),
    }),
  ],
  controllers: [AuthController, SetupController, UsersController],
  providers: [
    AuthService,
    PermissionService,
    SetupService,
    UserAdminService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [PermissionService, AuthService],
})
export class IamModule {}
