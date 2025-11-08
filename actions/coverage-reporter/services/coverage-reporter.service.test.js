import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';

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
All files          |   85.5 |    78.2 |   92.1 |   87.3 |
changeset-validator|   90.0 |    85.0 |   95.0 |   88.0 |
plan-maintenance   |   82.0 |    75.0 |   90.0 |   85.0 |
release-branching  |   84.0 |    76.0 |   91.0 |   89.0 |
            `
                    };
                }
                return { stdout: 'success' };
            },
        };

        mockFs = {
            existsSync: () => false,
            mkdirSync: () => { },
            writeFileSync: () => { },
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

    describe('calculateOverallCoverage', () => {
        it('should calculate average coverage correctly', () => {
            const coverage = {
                statements: 80,
                branches: 60,
                functions: 100,
                lines: 90,
            };

            const result = service.calculateOverallCoverage(coverage);
            assert.strictEqual(result, 82.5);
        });
    });

    describe('generateMarkdownReport', () => {
        it('should generate markdown report with coverage data', () => {
            const coverage = {
                statements: 85.5,
                branches: 78.2,
                functions: 92.1,
                lines: 87.3,
            };

            const result = service.generateMarkdownReport(coverage, 80);

            assert(result.includes('📊 Coverage Report'));
            assert(result.includes('85.50%'));
            assert(result.includes('78.20%'));
            assert(result.includes('✅'));
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
            assert(result.includes('❌'));
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
                stdout: `All files | 50.0 | 45.0 | 55.0 | 48.0 |`
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
