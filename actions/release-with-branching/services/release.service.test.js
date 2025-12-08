import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

import { ReleaseService } from './release.service.js';

describe('ReleaseService', () => {
  const planFilePath = '.release-meta/maintenance-branches.json';
  let mockFsApi;
  let mockShellService;
  let mockGitService;
  let releaseService;
  let mockPathApi;
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };

    // Mock filesystem
    mockFsApi = {
      existsSync: mock.fn(() => false),
      readdirSync: mock.fn(() => []),
      readFileSync: mock.fn(() => ''),
      resolve: mock.fn(() => planFilePath),
    };

    mockPathApi = {
      resolve: mock.fn(() => planFilePath),
    };

    // Mock shell service
    mockShellService = {
      exec: mock.fn(() => ({ stdout: '' })),
      run: mock.fn(() => ({ stdout: '' })),
    };

    // Mock git service
    mockGitService = {
      getChangedFiles: mock.fn(() => Promise.resolve([])),
      checkRemoteBranch: mock.fn(() => false),
      createBranch: mock.fn(),
      pushBranch: mock.fn(),
      pushTags: mock.fn(),
    };

    // Create release service with mocked dependencies
    releaseService = ReleaseService.create(
      mockShellService,
      mockFsApi,
      mockPathApi,
    );
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
      mockShellService.exec.mock.mockImplementation(() => {
        throw new Error('File not found');
      });

      const steps = releaseService.planRelease(ctx);

      assert.strictEqual(steps.length, 2);
      assert.strictEqual(steps[0].type, 'exec');
      assert.ok(steps[0].cmd.includes('changeset publish'));
      assert.strictEqual(steps[1].type, 'push-tags');
    });

    it('should read plan file from git history using git show', () => {
      const ctx = { isMultiRelease: true, isMainBranch: true };
      const planData = {
        '@scope/lib-one': { branchName: 'release/lib-one@2.0.0' },
      };
      mockShellService.exec.mock.mockImplementation((cmd) => {
        if (cmd.includes('git show HEAD:.release-meta')) {
          return { stdout: JSON.stringify(planData) };
        }
        return { stdout: '' };
      });

      const steps = releaseService.planRelease(ctx);

      // Verify git show was called
      const gitShowCall = mockShellService.exec.mock.calls.find((call) =>
        call.arguments[0].includes('git show HEAD:.release-meta'),
      );
      assert.ok(gitShowCall, 'Should call git show to read plan from history');

      assert.strictEqual(steps.length, 3);
      assert.strictEqual(steps[0].type, 'ensure-maintenance-branch');
      assert.strictEqual(steps[0].branchName, 'release/lib-one@2.0.0');
      assert.strictEqual(steps[1].type, 'exec');
      assert.strictEqual(steps[2].type, 'push-tags');
    });

    it('should plan release with maintenance branches when plan file exists', () => {
      const ctx = { isMultiRelease: true, isMainBranch: true };
      mockShellService.exec.mock.mockImplementation((cmd) => {
        if (cmd.includes('git show HEAD:.release-meta')) {
          return {
            stdout: JSON.stringify({
              '@scope/lib-one': { branchName: 'release/lib-one@2.0.0' },
            }),
          };
        }
        return { stdout: '' };
      });

      const steps = releaseService.planRelease(ctx);

      assert.strictEqual(steps.length, 3);
      assert.strictEqual(steps[0].type, 'ensure-maintenance-branch');
      assert.strictEqual(steps[0].branchName, 'release/lib-one@2.0.0');
      assert.strictEqual(steps[1].type, 'exec');
      assert.ok(steps[1].cmd.includes('changeset publish'));
      assert.strictEqual(steps[2].type, 'push-tags');
    });

    it('should only plan publish step when no plan file exists', () => {
      const ctx = { isMultiRelease: true, isMainBranch: true };
      mockShellService.exec.mock.mockImplementation(() => {
        throw new Error('File not found in git history');
      });

      const steps = releaseService.planRelease(ctx);

      assert.strictEqual(steps.length, 2);
      assert.strictEqual(steps[0].type, 'exec');
      assert.strictEqual(steps[1].type, 'push-tags');
    });
  });

  describe('executeSteps', () => {
    it('should execute exec step', () => {
      const steps = [{ type: 'exec', cmd: 'echo test' }];

      releaseService.executeSteps(steps);

      assert.strictEqual(mockShellService.exec.mock.callCount(), 1);
      assert.strictEqual(
        mockShellService.exec.mock.calls[0].arguments[0],
        'echo test',
      );
    });

    it('should execute ensure-maintenance-branch step', () => {
      const steps = [
        { type: 'ensure-maintenance-branch', branchName: 'release/test@1.0.0' },
      ];
      mockGitService.checkRemoteBranch.mock.mockImplementation(() => false);

      releaseService.executeSteps(steps);

      assert.strictEqual(mockGitService.checkRemoteBranch.mock.callCount(), 1);
      assert.strictEqual(mockGitService.createBranch.mock.callCount(), 1);
      assert.strictEqual(mockGitService.pushBranch.mock.callCount(), 1);
    });

    it('should execute push-tags step', () => {
      const steps = [{ type: 'push-tags' }];
      mockGitService.pushTags = mock.fn();

      releaseService.executeSteps(steps);

      assert.strictEqual(mockGitService.pushTags.mock.callCount(), 1);
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
      assert.strictEqual(
        mockGitService.createBranch.mock.calls[0].arguments[0],
        branchName,
      );
      assert.strictEqual(
        mockGitService.createBranch.mock.calls[0].arguments[1],
        'HEAD~1',
      );
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
        GITHUB_REF_NAME: 'main',
      };
      mockFsApi.existsSync.mock.mockImplementation(() => false);

      const ctx = releaseService.getReleaseContext(env);

      assert.strictEqual(ctx.isMultiRelease, true);
      assert.strictEqual(ctx.branchName, 'main');
      assert.strictEqual(ctx.isMainBranch, true);
      assert.strictEqual(ctx.isReleaseBranch, false);
      assert.strictEqual(ctx.hasChangesets, false);
    });

    it('should detect release branch', () => {
      const env = {
        ENABLE_MULTI_RELEASE: 'false',
        GITHUB_REF_NAME: 'release/lib-one@2.0.0',
      };
      mockFsApi.existsSync.mock.mockImplementation(() => false);

      const ctx = releaseService.getReleaseContext(env);

      assert.strictEqual(ctx.isReleaseBranch, true);
      assert.strictEqual(ctx.isMainBranch, false);
      assert.strictEqual(ctx.hasChangesets, false);
    });
  });

  describe('checkForChangesets', () => {
    it('should return false when .changeset directory does not exist', () => {
      mockFsApi.existsSync.mock.mockImplementation(() => false);

      const result = releaseService.checkForChangesets();

      assert.strictEqual(result, false);
    });

    it('should return false when only README.md exists', () => {
      mockFsApi.existsSync.mock.mockImplementation(() => true);
      mockFsApi.readdirSync.mock.mockImplementation(() => [
        'README.md',
        'config.json',
      ]);

      const result = releaseService.checkForChangesets();

      assert.strictEqual(result, false);
    });

    it('should return true when changeset files exist', () => {
      mockFsApi.existsSync.mock.mockImplementation(() => true);
      mockFsApi.readdirSync.mock.mockImplementation(() => [
        'README.md',
        'config.json',
        'soft-pants-count.md',
      ]);

      const result = releaseService.checkForChangesets();

      assert.strictEqual(result, true);
    });
  });

  describe('validatePreconditions', () => {
    it('should allow release on main branch', async () => {
      const ctx = {
        branchName: 'main',
        isMultiRelease: true,
        isMainBranch: true,
        isReleaseBranch: false,
        isChangesetReleaseBranch: false,
        hasChangesets: false,
      };
      mockGitService.getChangedFiles.mock.mockImplementation(() =>
        Promise.resolve(['packages/lib-one/package.json']),
      );

      const result = await releaseService.validatePreconditions(ctx);

      assert.strictEqual(result.proceedWithRelease, true);
    });

    it('should allow release on release branch', async () => {
      const ctx = {
        branchName: 'release/lib-one@2.0.0',
        isMultiRelease: true,
        isMainBranch: false,
        isReleaseBranch: true,
        isChangesetReleaseBranch: false,
        hasChangesets: false,
      };
      mockGitService.getChangedFiles.mock.mockImplementation(() =>
        Promise.resolve(['packages/lib-one/CHANGELOG.md']),
      );

      const result = await releaseService.validatePreconditions(ctx);

      assert.strictEqual(result.proceedWithRelease, true);
    });

    it('should skip release on changeset-release branch (Version PR)', async () => {
      const ctx = {
        branchName: 'changeset-release/main',
        isMultiRelease: true,
        isMainBranch: false,
        isReleaseBranch: false,
        isChangesetReleaseBranch: true,
        hasChangesets: false,
      };

      const result = await releaseService.validatePreconditions(ctx);

      assert.strictEqual(result.proceedWithRelease, false);
    });

    it('should skip release on feature branch in multi-release mode', async () => {
      const ctx = {
        branchName: 'feature/test',
        isMultiRelease: true,
        isMainBranch: false,
        isReleaseBranch: false,
        isChangesetReleaseBranch: false,
        hasChangesets: false,
      };

      const result = await releaseService.validatePreconditions(ctx);

      assert.strictEqual(result.proceedWithRelease, false);
    });

    it('should skip release when changesets exist (Version PR not merged)', async () => {
      const ctx = {
        branchName: 'main',
        isMultiRelease: true,
        isMainBranch: true,
        isReleaseBranch: false,
        isChangesetReleaseBranch: false,
        hasChangesets: true,
      };

      const result = await releaseService.validatePreconditions(ctx);

      assert.strictEqual(result.proceedWithRelease, false);
    });

    it('should skip release when no release-related changes detected', async () => {
      const ctx = {
        branchName: 'main',
        isMultiRelease: false,
        isMainBranch: true,
        isReleaseBranch: false,
        isChangesetReleaseBranch: false,
        hasChangesets: false,
      };
      mockGitService.getChangedFiles.mock.mockImplementation(() =>
        Promise.resolve(['src/feature.js', 'docs/README.md']),
      );

      const result = await releaseService.validatePreconditions(ctx);

      assert.strictEqual(result.proceedWithRelease, false);
    });
  });

  describe('run', () => {
    it('should skip release if preconditions are not met', async () => {
      const env = {
        GITHUB_REF_NAME: 'feature/test',
        ENABLE_MULTI_RELEASE: 'true',
      };

      await releaseService.run(env);

      assert.strictEqual(mockShellService.run.mock.callCount(), 0);
    });

    it('should execute release steps when preconditions are met', async () => {
      const env = { GITHUB_REF_NAME: 'main', ENABLE_MULTI_RELEASE: 'false' };
      mockGitService.getChangedFiles.mock.mockImplementation(() =>
        Promise.resolve(['packages/lib-one/package.json']),
      );
      mockShellService.exec.mock.mockImplementation((cmd) => {
        if (cmd.includes('git show HEAD:.release-meta')) {
          throw new Error('File not found');
        }
        return { stdout: '' };
      });

      await releaseService.run(env);

      // Should call git show (fails) and changeset publish
      assert.strictEqual(mockShellService.exec.mock.callCount(), 2);
      const publishCall = mockShellService.exec.mock.calls.find((call) =>
        call.arguments[0].includes('changeset publish'),
      );
      assert.ok(publishCall, 'Should call changeset publish');
      assert.strictEqual(mockGitService.pushTags.mock.callCount(), 1);
    });
  });

  describe('ReleaseService.create', () => {
    it('should create service instance with dependencies', () => {
      const service = ReleaseService.create(
        mockShellService,
        mockFsApi,
        mockPathApi,
      );

      assert.ok(service);
      assert.ok(service.git);
      assert.strictEqual(service.shell, mockShellService);
      assert.strictEqual(service.fs, mockFsApi);
      assert.strictEqual(service.path, mockPathApi);
    });
  });
});
