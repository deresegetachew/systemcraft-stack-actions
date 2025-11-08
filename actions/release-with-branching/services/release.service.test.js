import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

import { ReleaseService } from './release.service.js';

describe('ReleaseService', () => {
    const planFilePath = '.release-meta/maintenance-branches.json';
    let mockFsApi;
    let mockShellService;
    let mockGitService;
    let releaseService;
    let originalEnv;

    beforeEach(() => {
        originalEnv = { ...process.env };

        // Mock filesystem
        mockFsApi = {
            existsSync: mock.fn(() => false),
            readdirSync: mock.fn(() => []),
            readFileSync: mock.fn(() => ''),
            resolve: mock.fn(() => planFilePath)
        };

        // Mock shell service
        mockShellService = {
            exec: mock.fn(() => ({ stdout: '' })),
            run: mock.fn(() => ({ stdout: '' }))
        };

        // Mock git service
        mockGitService = {
            getChangedFiles: mock.fn(() => Promise.resolve([])),
            checkRemoteBranch: mock.fn(() => false),
            createBranch: mock.fn(),
            pushBranch: mock.fn()
        };

        // Create release service with mocked dependencies
        releaseService = ReleaseService.create(mockShellService, mockFsApi);
        // Override git service with mock
        releaseService.git = mockGitService;
    });

    afterEach(() => {
        process.env = originalEnv;
        mock.restoreAll();
    });

    describe('planRelease', () => {
        it('should plan simple release without maintenance branches', () => {
            const ctx = { isMultiRelease: false, isMainBranch: true };

            const steps = releaseService.planRelease(ctx);

            assert.strictEqual(steps.length, 1);
            assert.strictEqual(steps[0].type, 'exec');
            assert.ok(steps[0].cmd.includes('changeset publish'));
        });

        it('should plan release with maintenance branches when plan file exists', () => {
            const ctx = { isMultiRelease: true, isMainBranch: true };
            mockFsApi.existsSync.mock.mockImplementation(() => true);
            mockFsApi.readFileSync.mock.mockImplementation(() =>
                JSON.stringify({
                    '@scope/lib-one': { branchName: 'release/lib-one@2.0.0' }
                })
            );

            const steps = releaseService.planRelease(ctx);

            assert.strictEqual(steps.length, 2);
            assert.strictEqual(steps[0].type, 'ensure-maintenance-branch');
            assert.strictEqual(steps[0].branchName, 'release/lib-one@2.0.0');
            assert.strictEqual(steps[1].type, 'exec');
            assert.ok(steps[1].cmd.includes('changeset publish'));
        });

        it('should only plan publish step when no plan file exists', () => {
            const ctx = { isMultiRelease: true, isMainBranch: true };
            mockFsApi.existsSync.mock.mockImplementation(() => false);

            const steps = releaseService.planRelease(ctx);

            assert.strictEqual(steps.length, 1);
            assert.strictEqual(steps[0].type, 'exec');
        });
    });

    describe('executeSteps', () => {
        it('should execute exec step', () => {
            const steps = [{ type: 'exec', cmd: 'echo test' }];

            releaseService.executeSteps(steps);

            assert.strictEqual(mockShellService.run.mock.callCount(), 1);
            assert.strictEqual(mockShellService.run.mock.calls[0].arguments[0], 'echo test');
        });

        it('should execute ensure-maintenance-branch step', () => {
            const steps = [{ type: 'ensure-maintenance-branch', branchName: 'release/test@1.0.0' }];
            mockGitService.checkRemoteBranch.mock.mockImplementation(() => false);

            releaseService.executeSteps(steps);

            assert.strictEqual(mockGitService.checkRemoteBranch.mock.callCount(), 1);
            assert.strictEqual(mockGitService.createBranch.mock.callCount(), 1);
            assert.strictEqual(mockGitService.pushBranch.mock.callCount(), 1);
        });

        it('should handle unknown step type', () => {
            const steps = [{ type: 'unknown', data: 'test' }];

            assert.throws(() => {
                releaseService.executeSteps(steps);
            }, /Unknown step type: unknown/);
        });
    });

    describe('ensureMaintenanceBranch', () => {
        it('should create branch when it does not exist', () => {
            const branchName = 'release/lib-one@2.0.0';
            mockGitService.checkRemoteBranch.mock.mockImplementation(() => false);

            releaseService.ensureMaintenanceBranch(branchName);

            assert.strictEqual(mockGitService.checkRemoteBranch.mock.callCount(), 1);
            assert.strictEqual(mockGitService.createBranch.mock.callCount(), 1);
            assert.strictEqual(mockGitService.pushBranch.mock.callCount(), 1);
            assert.strictEqual(mockGitService.createBranch.mock.calls[0].arguments[0], branchName);
            assert.strictEqual(mockGitService.createBranch.mock.calls[0].arguments[1], 'HEAD~1');
        });

        it('should skip creation when branch already exists', () => {
            const branchName = 'release/lib-one@2.0.0';
            mockGitService.checkRemoteBranch.mock.mockImplementation(() => true);

            releaseService.ensureMaintenanceBranch(branchName);

            assert.strictEqual(mockGitService.checkRemoteBranch.mock.callCount(), 1);
            assert.strictEqual(mockGitService.createBranch.mock.callCount(), 0);
            assert.strictEqual(mockGitService.pushBranch.mock.callCount(), 0);
        });
    });

    describe('getReleaseContext', () => {
        it('should parse environment variables correctly', () => {
            const env = {
                ENABLE_MULTI_RELEASE: 'true',
                GITHUB_REF_NAME: 'main'
            };

            const ctx = releaseService.getReleaseContext(env);

            assert.strictEqual(ctx.isMultiRelease, true);
            assert.strictEqual(ctx.branchName, 'main');
            assert.strictEqual(ctx.isMainBranch, true);
            assert.strictEqual(ctx.isReleaseBranch, false);
        });

        it('should detect release branch', () => {
            const env = {
                ENABLE_MULTI_RELEASE: 'false',
                GITHUB_REF_NAME: 'release/lib-one@2.0.0'
            };

            const ctx = releaseService.getReleaseContext(env);

            assert.strictEqual(ctx.isReleaseBranch, true);
            assert.strictEqual(ctx.isMainBranch, false);
        });
    });

    describe('validatePreconditions', () => {
        it('should allow release on main branch', async () => {
            const ctx = {
                branchName: 'main',
                isMultiRelease: true,
                isMainBranch: true,
                isReleaseBranch: false
            };
            mockGitService.getChangedFiles.mock.mockImplementation(() =>
                Promise.resolve(['packages/lib-one/package.json'])
            );

            const result = await releaseService.validatePreconditions(ctx);

            assert.strictEqual(result.proceedWithRelease, true);
        });

        it('should allow release on release branch', async () => {
            const ctx = {
                branchName: 'release/lib-one@2.0.0',
                isMultiRelease: true,
                isMainBranch: false,
                isReleaseBranch: true
            };
            mockGitService.getChangedFiles.mock.mockImplementation(() =>
                Promise.resolve(['packages/lib-one/CHANGELOG.md'])
            );

            const result = await releaseService.validatePreconditions(ctx);

            assert.strictEqual(result.proceedWithRelease, true);
        });

        it('should skip release on feature branch in multi-release mode', async () => {
            const ctx = {
                branchName: 'feature/test',
                isMultiRelease: true,
                isMainBranch: false,
                isReleaseBranch: false
            };

            const result = await releaseService.validatePreconditions(ctx);

            assert.strictEqual(result.proceedWithRelease, false);
        });

        it('should skip release when no release-related changes detected', async () => {
            const ctx = {
                branchName: 'main',
                isMultiRelease: false,
                isMainBranch: true,
                isReleaseBranch: false
            };
            mockGitService.getChangedFiles.mock.mockImplementation(() =>
                Promise.resolve(['src/feature.js', 'docs/README.md'])
            );

            const result = await releaseService.validatePreconditions(ctx);

            assert.strictEqual(result.proceedWithRelease, false);
        });
    });

    describe('run', () => {
        it('should skip release if preconditions are not met', async () => {
            const env = { GITHUB_REF_NAME: 'feature/test', ENABLE_MULTI_RELEASE: 'true' };

            await releaseService.run(env);

            assert.strictEqual(mockShellService.run.mock.callCount(), 0);
        });

        it('should execute release steps when preconditions are met', async () => {
            const env = { GITHUB_REF_NAME: 'main', ENABLE_MULTI_RELEASE: 'false' };
            mockGitService.getChangedFiles.mock.mockImplementation(() =>
                Promise.resolve(['packages/lib-one/package.json'])
            );

            await releaseService.run(env);

            assert.strictEqual(mockShellService.run.mock.callCount(), 1);
            assert.ok(mockShellService.run.mock.calls[0].arguments[0].includes('changeset publish'));
        });
    });

    describe('ReleaseService.create', () => {
        it('should create service instance with dependencies', () => {
            const service = ReleaseService.create(mockShellService, mockFsApi);

            assert.ok(service);
            assert.ok(service.git);
            assert.strictEqual(service.shell, mockShellService);
            assert.strictEqual(service.fs, mockFsApi);
        });
    });
});