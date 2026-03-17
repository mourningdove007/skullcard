/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  testMatch: ["**/*.test.js"],
  collectCoverageFrom: [
    "*.js",
    "!jest.config.js",
    "!index.js",
  ],
  coverageDirectory: "coverage",
  verbose: true,
};
