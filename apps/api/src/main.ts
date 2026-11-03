import { Logger } from '@nestjs/common';
import { createApp } from './app.factory';
import { env } from './config/env';
import { migrate } from './infrastructure/db/migrator';

async function bootstrap() {
  const currentEnv = env();
  if (currentEnv.DATABASE_URL) {
    try {
      new Logger('Bootstrap').log('Checking and running database migrations...');
      const res = await migrate(currentEnv.DATABASE_URL, (msg) => new Logger('Migrator').log(msg));
      new Logger('Bootstrap').log(`Database migrations ready: applied=${res.applied.length}, skipped=${res.skipped.length}`);
    } catch (err: any) {
      new Logger('Bootstrap').error(`Database migration warning: ${err.message}`);
    }
  }
  const app = await createApp();
  await app.listen(currentEnv.PORT);
  new Logger('Bootstrap').log(`IDHAM HR ACCOUNTING ERP API listening on :${currentEnv.PORT}/api/v1`);
}

void bootstrap();
