import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    env: {
      ADMIN_API_KEY: 'test-admin-key',
      DATABASE_URL: 'postgresql://hermit:securepass@localhost:5432/hermitclaw',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'], // entry point, not unit testable
    },
  },
});
