import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { env } from './config/env';
import { ProblemFilter } from './shared/http/problem.filter';

/** Builds the HTTP application (shared by main.ts and the e2e tests). */
export async function createApp(opts: { logger?: boolean } = {}): Promise<INestApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: opts.logger === false ? false : ['error', 'warn', 'log'],
  });
  app.set('trust proxy', 1);
  app.set('query parser', 'simple');
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: env().CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Company-Id', 'X-Requested-With', 'Idempotency-Key', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id'],
  });
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new ProblemFilter());
  app.enableShutdownHooks();
  return app;
}
