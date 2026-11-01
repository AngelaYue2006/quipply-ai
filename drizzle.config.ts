import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  // Used by `pnpm db:studio` to browse your local database.
  dbCredentials: { url: './data/quipply.db' },
});
