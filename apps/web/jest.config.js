const nextJest = require('next/jest')

const createJestConfig = nextJest({ dir: './' })

const config = {
  displayName: 'web',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@reci/(.*)$': '<rootDir>/../../packages/$1/src',
  },
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  collectCoverageFrom: [
    'app/api/**/*.ts',
    'lib/**/*.ts',
    '!**/*.d.ts',
  ],
}

module.exports = createJestConfig(config)
