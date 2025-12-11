import path from 'node:path';

import { GitUtil, loadChangesetFiles } from '@systemcraft-stack-actions/utils';

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
      // Create maintenance branch from HEAD~1 (the commit before the version PR merge)
      //
      // Context: This action runs AFTER the version PR has been merged to main.
      // The version PR contains bumped package versions (e.g., 3.5.0 → 4.0.0).
      // We want the maintenance branch to be frozen at the state BEFORE the version bump,
      // so it can receive backported patches for the old major version.
      //
      // HEAD~1 points to the last commit on main before the version PR merged,
      // which is exactly the snapshot we need - it includes all changes up to but not
      // including the version bump. This ensures the maintenance branch (e.g., v3-lib-one)
      // stays on the old major version while main continues with the new version.
      //
      // Example timeline:
      //   1. main at commit A (lib-one@3.5.0)
      //   2. Version PR merges → main at commit B (lib-one@4.0.0) ← HEAD is here
      //   3. We create v3-lib-one from HEAD~1 (commit A) ← frozen at 3.5.0
      console.debug(`Creating '${branchName}' from HEAD~1...`);
      this.git.createBranch(branchName, 'HEAD~1');
      this.git.pushBranch(branchName);
      console.debug(`✅ Created and pushed '${branchName}' from HEAD~1.`);
    } else {
      console.debug(`✅ Branch '${branchName}' already exists.`);
    }
  }

  checkForChangesets() {
    try {
      const changesetFiles = loadChangesetFiles(this.fs, process.cwd());
      return changesetFiles.length > 0;
    } catch (error) {
      console.debug(`Error loading changeset files: ${error.message}`);
      return false;
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

    // Check if there are changesets to process
    // If changesets exist, Version PR hasn't been merged yet
    const hasChangesets = this.checkForChangesets();

    return {
      isMultiRelease,
      branchName,
      isReleaseBranch,
      isMainBranch,
      isChangesetReleaseBranch,
      hasChangesets,
    };
  }

  async validatePreconditions(ctx) {
    const {
      branchName,
      isMultiRelease,
      isReleaseBranch,
      isMainBranch,
      isChangesetReleaseBranch,
      hasChangesets,
    } = ctx;

    console.debug('ctx', { ctx });

    // Skip if on changeset-release branch (Version PR branch)
    if (isChangesetReleaseBranch) {
      console.warn(
        `⏭️  Skipping release: on Version PR branch ${branchName}. Release will happen after PR is merged.`,
      );
      return { proceedWithRelease: false };
    }

    // Skip if there are changesets to process (Version PR not merged yet)
    if (hasChangesets) {
      console.warn(
        `⏭️  Skipping release: changesets detected in .changeset directory. Release will happen after Version PR is merged.`,
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

  ensureCorrectBranch(triggerBranch) {
    const { currentBranch, mismatch } =
      this.git.logBranchContext(triggerBranch);

    if (mismatch) {
      console.warn(
        `⚠️  Branch mismatch! Switching from '${currentBranch}' to '${triggerBranch}'`,
      );
      this.git.checkoutBranch(triggerBranch);
      console.debug(`✅ Switched to branch: ${triggerBranch}`);
      return true; // Switched
    }
    return false; // No switch needed
  }

  async run(env = process.env) {
    console.debug('🚀 Starting release script...');

    // Ensure we're on the correct branch before reading context
    // This can happen if a previous step (like changesets/action) switched branches
    const triggerBranch = env.GITHUB_REF_NAME;
    this.ensureCorrectBranch(triggerBranch);

    // Get release context after ensuring correct branch
    const ctx = this.getReleaseContext(env);
    const { proceedWithRelease } = await this.validatePreconditions(ctx);

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
