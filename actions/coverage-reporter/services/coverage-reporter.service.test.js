import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { CoverageReporterService } from './coverage-reporter.service.js';

describe('CoverageReporterService', () => {
  let service;
  let mockShell;
  let mockFs;

  beforeEach(() => {
    mockShell = {
      exec: (cmd, options) => {
        if (cmd.includes('coverage')) {
          return {
            stdout: `
All files          |   85.5 |    88.2 |   92.1 |   87.3 |
changeset-validator|   90.0 |    85.0 |   95.0 |   88.0 |
plan-maintenance   |   82.0 |    75.0 |   90.0 |   85.0 |
release-branching  |   84.0 |    76.0 |   91.0 |   89.0 |
            `,
          };
        }
        return { stdout: 'success' };
      },
    };

    mockFs = {
      existsSync: () => false,
      mkdirSync: () => {},
      writeFileSync: () => {},
      rmSync: () => {},
      readFileSync: () => '{}',
    };

    service = new CoverageReporterService(mockShell, mockFs);
  });

  describe('parseCoverageFromOutput', () => {
    it('should parse c8 coverage output correctly', () => {
      const output = `
All files          |   85.5 |    78.2 |   92.1 |   87.3 |
      `;

      const result = service.parseCoverageFromOutput(output);

      assert.strictEqual(result.statements, 85.5);
      assert.strictEqual(result.branches, 78.2);
      assert.strictEqual(result.functions, 92.1);
      assert.strictEqual(result.lines, 87.3);
    });

    it('should handle missing coverage data', () => {
      const result = service.parseCoverageFromOutput('no coverage data');

      assert.strictEqual(result.statements, 0);
      assert.strictEqual(result.branches, 0);
      assert.strictEqual(result.functions, 0);
      assert.strictEqual(result.lines, 0);
    });
  });

  describe('createPackageComparisonSummary', () => {
    it('should build per-metric diffs against baseline', () => {
      const currentCoverage = {
        type: 'packages',
        packages: [
          {
            package: 'pkg-a',
            coverage: {
              statements: 80,
              branches: 70,
              functions: 90,
              lines: 85,
            },
          },
          {
            package: 'pkg-b',
            coverage: {
              statements: 90,
              branches: 92,
              functions: 88,
              lines: 94,
            },
          },
        ],
      };

      const baselineCoverage = {
        type: 'packages',
        packages: [
          {
            package: 'pkg-a',
            coverage: {
              statements: 75,
              branches: 70,
              functions: 85,
              lines: 80,
            },
          },
        ],
      };

      const summary = service.createPackageComparisonSummary(
        currentCoverage,
        baselineCoverage,
        80,
      );

      const pkgA = summary.packages.find((pkg) => pkg.package === 'pkg-a');
      const pkgB = summary.packages.find((pkg) => pkg.package === 'pkg-b');

      assert.deepStrictEqual(pkgA.diff, {
        statements: 5,
        branches: 0,
        functions: 5,
        lines: 5,
      });
      assert.strictEqual(pkgA.status, 'fail');
      assert.strictEqual(pkgB.diff, null);

      assert.strictEqual(summary.diff.statements, 5);
      assert.strictEqual(summary.diff.branches, 0);
      assert.strictEqual(summary.diff.functions, 5);
      assert.strictEqual(summary.diff.lines, 5);
      assert.strictEqual(summary.status, 'fail');
    });
  });

  describe('generateMarkdownReport', () => {
    it('should generate markdown report with coverage data', () => {
      const coverage = {
        statements: 85.5,
        branches: 88.2,
        functions: 92.1,
        lines: 87.3,
      };

      const result = service.generateMarkdownReport(coverage, 80);

      assert(result.includes('📊 Coverage Report'));
      assert(result.includes('85.50%'));
      assert(result.includes('88.20%'));
      assert(result.includes('✅ Pass'));
    });

    it('should show warning for low coverage', () => {
      const coverage = {
        statements: 65,
        branches: 55,
        functions: 70,
        lines: 60,
      };

      const result = service.generateMarkdownReport(coverage, 80);

      assert(result.includes('⚠️ **Coverage is below minimum'));
      assert(result.includes('❌ Fail'));
    });
  });

  describe('generatePackageMarkdownReport', () => {
    it('should render per-package table with baseline and diffs', () => {
      const summary = {
        type: 'packages',
        packages: [
          {
            package: '@scope/pkg-a',
            coverage: {
              statements: 90,
              branches: 80,
              functions: 85,
              lines: 88,
            },
            baseline: {
              statements: 88,
              branches: 75,
              functions: 82,
              lines: 87,
            },
          },
          {
            package: '@scope/pkg-b',
            coverage: {
              statements: 70,
              branches: 65,
              functions: 60,
              lines: 68,
            },
            baseline: {
              statements: 60,
              branches: 60,
              functions: 55,
              lines: 58,
            },
          },
        ],
      };

      const result = service.generatePackageMarkdownReport(
        summary,
        75,
        summary,
      );

      assert(result.includes('Coverage Report by Package'));
      assert(result.includes('@scope/pkg-a'));
      assert(result.includes('@scope/pkg-b'));
      assert(result.includes('90.00%'));
      assert(result.includes('75.00%'));
      assert(result.includes('✅ Pass'));
      assert(result.includes('❌ Fail'));
    });
  });

  describe('metadata helpers', () => {
    it('should build artifacts URL when env is set', () => {
      const original = {
        server: process.env.GITHUB_SERVER_URL,
        repo: process.env.GITHUB_REPOSITORY,
        run: process.env.GITHUB_RUN_ID,
      };
      process.env.GITHUB_SERVER_URL = 'https://example.com';
      process.env.GITHUB_REPOSITORY = 'owner/repo';
      process.env.GITHUB_RUN_ID = '123';

      const localService = new CoverageReporterService(mockShell, fs);
      const url = localService.getArtifactsUrl();
      assert.strictEqual(
        url,
        'https://example.com/owner/repo/actions/runs/123',
      );

      process.env.GITHUB_SERVER_URL = original.server;
      process.env.GITHUB_REPOSITORY = original.repo;
      process.env.GITHUB_RUN_ID = original.run;
    });

    it('should read PR number from event payload', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cov-event-'));
      const eventPath = path.join(tmpDir, 'event.json');
      fs.writeFileSync(
        eventPath,
        JSON.stringify({ pull_request: { number: 42 } }),
      );

      process.env.GITHUB_EVENT_PATH = eventPath;
      const localService = new CoverageReporterService(mockShell, fs);
      const prNumber = localService.getPullRequestNumberFromEnv();
      assert.strictEqual(prNumber, 42);
      fs.rmSync(tmpDir, { recursive: true, force: true });
      delete process.env.GITHUB_EVENT_PATH;
    });

    it('should upsert PR comment when data is available', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cov-event-'));
      const eventPath = path.join(tmpDir, 'event.json');
      fs.writeFileSync(
        eventPath,
        JSON.stringify({ pull_request: { number: 7 } }),
      );
      process.env.GITHUB_EVENT_PATH = eventPath;
      process.env.GITHUB_REPOSITORY = 'owner/repo';
      process.env.GITHUB_TOKEN = 't0k';
      process.env.GITHUB_SERVER_URL = 'https://example.com';
      process.env.GITHUB_API_URL = 'https://api.example.com';

      const fetchCalls = [];
      global.fetch = async (url, options = {}) => {
        fetchCalls.push({ url, options });
        if (url.includes('comments?per_page')) {
          return { ok: true, json: async () => [] };
        }
        return { ok: true, json: async () => ({}) };
      };

      const localService = new CoverageReporterService(mockShell, fs);
      await localService.postPrCommentIfAvailable('body');
      assert.strictEqual(fetchCalls.length, 2);
      assert(fetchCalls[1].url.includes('/issues/7/comments'));

      fs.rmSync(tmpDir, { recursive: true, force: true });
      delete process.env.GITHUB_EVENT_PATH;
      delete process.env.GITHUB_REPOSITORY;
      delete process.env.GITHUB_TOKEN;
      delete process.env.GITHUB_SERVER_URL;
      delete process.env.GITHUB_API_URL;
      delete global.fetch;
    });
  });

  describe('run', () => {
    it('should complete coverage reporting successfully', async () => {
      const inputs = {
        coverageCommand: 'pnpm test --coverage',
        coverageFormat: 'lcov',
        outputDir: 'coverage-artifacts',
        enablePrComments: true,
        minimumCoverage: 80,
        githubToken: 'token',
      };

      const result = await service.run(inputs);

      assert.strictEqual(result.status, 'pass');
      assert(parseFloat(result.coveragePercentage) > 0);
      assert.strictEqual(result.artifactsPath, 'coverage-artifacts');
    });

    it('should fail when coverage is below threshold', async () => {
      // Mock low coverage output
      mockShell.exec = () => ({
        stdout: `All files | 50.0 | 45.0 | 55.0 | 48.0 |`,
      });
      service = new CoverageReporterService(mockShell, mockFs);

      const inputs = {
        coverageCommand: 'pnpm test --coverage',
        outputDir: 'coverage-artifacts',
        enablePrComments: true,
        minimumCoverage: 80,
      };

      const result = await service.run(inputs);
      assert.strictEqual(result.status, 'fail');
    });

    it('should attach baseline coverage when diff mode is enabled', async () => {
      const baselineCoverage = {
        statements: 75,
        branches: 70,
        functions: 80,
        lines: 78,
      };
      let downloadCalled = false;

      service.getBaselineCoverage = async () => {
        downloadCalled = true;
        return baselineCoverage;
      };

      const inputs = {
        coverageCommand: 'pnpm test --coverage',
        outputDir: 'coverage-artifacts',
        enablePrComments: false,
        minimumCoverage: 70,
        enableDiff: true,
        baselineArtifactName: 'coverage-baseline',
        githubToken: 'token',
      };

      const result = await service.run(inputs);

      assert(downloadCalled, 'Expected getBaselineCoverage to be called');
      assert.deepStrictEqual(result.baselineCoverage, baselineCoverage);
      assert.deepStrictEqual(result.summary.baseline, baselineCoverage);
      assert.strictEqual(result.status, 'pass');
    });
  });

  describe('constructor', () => {
    it('should create with default dependencies', () => {
      const serviceWithDefaults = new CoverageReporterService();
      assert(serviceWithDefaults.shell);
      assert(serviceWithDefaults.fs);
    });

    it('should use provided dependencies', () => {
      const service = new CoverageReporterService(mockShell, mockFs);
      assert.strictEqual(service.shell, mockShell);
      assert.strictEqual(service.fs, mockFs);
    });
  });

  describe('CoverageReporterService.create', () => {
    it('should create service instance', () => {
      const service = CoverageReporterService.create();
      assert(service instanceof CoverageReporterService);
    });
  });
});
