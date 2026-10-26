import { Logger } from '@nestjs/common';
import { createApp } from './app.factory';
import { env } from './config/env';

async function bootstrap() {
  const app = await createApp();
  await app.listen(env().PORT);
  new Logger('Bootstrap').log(`IDHAM HR ACCOUNTING ERP API listening on :${env().PORT}/api/v1`);
}

void bootstrap();
