const nextJest = require('next/jest');

const createJestConfig = nextJest({ dir: './' });

module.exports = createJestConfig({
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testEnvironment: 'jest-environment-jsdom',
  coverageProvider: 'v8',
  collectCoverageFrom: [
    'core/**/*.ts',
    'components/**/*.tsx',
    'utils/mockData.ts',
    'app/search/**/*.{ts,tsx}',
    'app/api/agents/route.ts',
    'app/api/claude/route.ts',
    'app/api/flights/route.ts',
    '!**/*.d.ts',
    '!**/node_modules/**',
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testMatch: ['<rootDir>/__tests__/**/*.test.{ts,tsx}'],
});
