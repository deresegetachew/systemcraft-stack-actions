import path from 'node:path';

import { GitUtil } from '@systemcraft-stack-actions/utils';

export class ReleaseService {
  constructor(gitService, shellService, fsApi, pathApi) {
    this.git = gitService;
    this.shell = shellService;
    this.fs = fsApi;
    this.path = pathApi || path;
  }

  static create(shell, fsApi, pathApi = path) {
    const gitService = new GitUtil(shell);
    return new ReleaseService(gitService, shell, fsApi, pathApi);
  }

  planRelease(ctx) {
    const { isMultiRelease, isMainBranch } = ctx;
    const steps = [];

    // Read plan from git history (HEAD commit) instead of filesystem
    // because filesystem contains the reset empty plan from current run
    let plan = {};
    try {
      const result = this.shell.exec(
        'git show HEAD:.release-meta/maintenance-branches.json',
        { stdio: 'pipe' },
      );
      plan = JSON.parse(result.stdout);
      console.debug('📋 Read plan from git history:', plan);
      // eslint-disable-next-line no-unused-vars
    } catch (__error) {
      // File doesn't exist in git history or error reading it
      console.debug('ℹ️ No plan file found in git history, using empty plan.');
      plan = {};
    }

    if (
      Object.getOwnPropertyNames(plan).length > 0 &&
      isMultiRelease &&
      isMainBranch
    ) {
      for (const pkgName in plan) {
        const { branchName } = plan[pkgName];
        steps.push({ type: 'ensure-maintenance-branch', branchName });
      }
    }

    steps.push({ type: 'exec', cmd: 'pnpm changeset publish' });
    steps.push({ type: 'push-tags' });

    console.debug(
      `planned release steps: ${steps.map((s) => s.type).join(', ')}`,
    );
    return steps;
  }

  executeSteps(steps) {
    for (const step of steps) {
      switch (step.type) {
        case 'log-warn': {
          console.warn(step.msg);
          break;
        }

        case 'exec': {
          this.shell.exec(step.cmd, { stdio: 'inherit' });
          break;
        }

        case 'ensure-maintenance-branch': {
          this.ensureMaintenanceBranch(step.branchName);
          break;
        }

        case 'push-tags': {
          this.git.pushTags();
          break;
        }

        default:
          throw new Error(`Unknown step type: ${step.type}`);
      }
    }
  }

  ensureMaintenanceBranch(branchName) {
    console.debug(`Checking for branch '${branchName}'...`);

    const branchExists = this.git.checkRemoteBranch(branchName);

    if (!branchExists) {
      console.debug(`Creating '${branchName}'...`);
      this.git.createBranch(branchName, 'HEAD~1');
      this.git.pushBranch(branchName);
      console.debug(
        `✅ Created and pushed '${branchName}' from previous commit.`,
      );
    } else {
      console.debug(`✅ Branch '${branchName}' already exists.`);
    }
  }

  getReleaseContext(env) {
    const isMultiRelease = env.ENABLE_MULTI_RELEASE === 'true';
    const branchName = env.GITHUB_REF_NAME;
    const isReleaseBranch = Boolean(
      branchName && branchName.startsWith('release/'),
    );
    const isMainBranch = branchName === 'main';
    const isChangesetReleaseBranch = Boolean(
      branchName && branchName.startsWith('changeset-release/'),
    );

    return {
      isMultiRelease,
      branchName,
      isReleaseBranch,
      isMainBranch,
      isChangesetReleaseBranch,
    };
  }

  async validatePreconditions(ctx) {
    const {
      branchName,
      isMultiRelease,
      isReleaseBranch,
      isMainBranch,
      isChangesetReleaseBranch,
    } = ctx;

    // Skip if on changeset-release branch (Version PR branch)
    if (isChangesetReleaseBranch) {
      console.warn(
        `⏭️  Skipping release: on Version PR branch ${branchName}. Release will happen after PR is merged.`,
      );
      return { proceedWithRelease: false };
    }

    // Check branch conditions first to avoid unnecessary git calls
    if (!isMainBranch && !isReleaseBranch && isMultiRelease) {
      console.warn(
        `Skipping release : on branch ${branchName}. for Multi-Release mode .`,
      );
      return { proceedWithRelease: false };
    }

    const changedFiles = await this.git.getChangedFiles();
    const latestChangesAreReleaseChanges = changedFiles.some(
      (file) => file.endsWith('package.json') || file.endsWith('CHANGELOG.md'),
    );

    console.debug(
      `Checking for release commit by inspecting changed files in HEAD...`,
    );

    if (latestChangesAreReleaseChanges) {
      console.debug(
        '✅ Versioning changes detected (package.json, CHANGELOG.md, or .changeset/ files modified). Proceeding with release.',
      );
      return { proceedWithRelease: true };
    }

    return { proceedWithRelease: false };
  }

  async run(env = process.env) {
    console.debug('🚀 Starting release script...');

    const ctx = this.getReleaseContext(env);
    const { proceedWithRelease } = await this.validatePreconditions(ctx);

    console.debug(`🔍 Current branch: ${ctx.branchName}`);
    console.debug(`🔍 Multi-release mode: ${ctx.isMultiRelease}`);
    console.debug(`Proceed with release: ${proceedWithRelease}`);

    if (!proceedWithRelease) {
      console.debug('ℹ️ Skipping release process: No steps to execute.');
      return;
    }

    const steps = this.planRelease(ctx);
    console.debug('📝 Planned steps:', steps.map((s) => s.type).join(', '));

    this.executeSteps(steps);
    console.debug('✅ Release process completed successfully.');
  }
}
