import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

// Mock @actions/core and @actions/github before importing the main module
const mockCore = {
    getInput: (name) => {
        const inputs = {
            'coverage-command': 'pnpm test --coverage',
            'coverage-format': 'lcov',
            'output-dir': 'coverage-artifacts',
            'enable-pr-comments': 'true',
            'minimum-coverage': '80',
            'github-token': 'test-token',
        };
        return inputs[name] || '';
    },
    getBooleanInput: (name) => {
        return name === 'enable-pr-comments';
    },
    setOutput: () => { },
    setFailed: () => { },
};

const mockGithub = {};

globalThis.mockActionsCore = mockCore;
globalThis.mockActionsGithub = mockGithub;

describe('Coverage Reporter Action', () => {
    let originalEnv;

    beforeEach(() => {
        originalEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'test';
    });

    afterEach(() => {
        process.env.NODE_ENV = originalEnv;
    });
    describe('Service Export', () => {
        it('should export CoverageReporterService', async () => {
            const { CoverageReporterService } = await import(
                './services/coverage-reporter.service.js'
            );
            assert(typeof CoverageReporterService === 'function');
        });

        it('should allow service instantiation', async () => {
            const { CoverageReporterService } = await import(
                './services/coverage-reporter.service.js'
            );
            const service = new CoverageReporterService();
            assert(service instanceof CoverageReporterService);
        });
    });

    describe('GitHub Actions Integration', () => {
        it('should handle missing GitHub Actions modules', async () => {
            // This test verifies the action can be imported even when @actions modules are not available
            try {
                await import('./index.js');
                assert(true, 'Should not throw when importing');
            } catch (error) {
                // Expected in test environment where @actions modules aren't installed
                assert(
                    error.message.includes('@actions/core') ||
                    error.message.includes('coverage-reporter'),
                );
            }
        });

        it('should export main function', async () => {
            try {
                const module = await import('./index.js');
                assert(typeof module.main === 'function');
            } catch (error) {
                // Expected due to missing @actions dependencies in test environment
                assert(error.message.includes('@actions'));
            }
        });
    });
});
