import { env } from '../../config/env';
import { migrate } from './migrator';

const target = process.argv.includes('--test') ? env().TEST_DATABASE_URL : env().DATABASE_URL;
if (!target) {
  console.error('Database URL not configured');
  process.exit(1);
}

migrate(target)
  .then((r) => {
    console.log(`[migrate] done. applied=${r.applied.length} already-applied=${r.skipped.length}`);
    process.exit(0);
  })
  .catch((e) => {
    console.error(`[migrate] ${e.message}`);
    process.exit(1);
  });
