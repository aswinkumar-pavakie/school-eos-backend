// Prisma 7.x moved datasource-URL resolution out of schema.prisma's automatic .env
// pickup and into this config file. CLI-tooling only (db pull, studio) — application
// code never imports from here or from Prisma Client.

import { defineConfig, env } from 'prisma/config';

process.loadEnvFile('.env');

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
});
