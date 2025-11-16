import { GitUtil, ShellUtil } from '@systemcraft-stack-actions/utils';

export class ChangesetRequirementService {
  constructor(dependencies = {}) {
    this.gitUtil =
      dependencies.gitUtil ||
      new GitUtil(dependencies.shellUtil || new ShellUtil());
    this.shellUtil = dependencies.shellUtil || new ShellUtil();
  }

  shouldSkipCheck(context, skipLabel) {
    const { eventName, payload, actor } = context;

    // Skip if not a pull request
    if (eventName !== 'pull_request') {
      console.debug('ℹ️ Not a pull request, skipping changeset check.');
      return true;
    }

    const prTitle = payload.pull_request?.title || '';
    const prBody = payload.pull_request?.body || '';
    const headRef = payload.pull_request?.head?.ref || '';

    // Skip for release PRs created by Changesets
    if (
      prTitle.startsWith('Version Packages') ||
      actor === 'github-actions[bot]' ||
      headRef.startsWith('changeset-release/')
    ) {
      console.debug(
        'ℹ️ Release PR, dependabot, or bot PR detected, skipping changeset check.',
      );
      return true;
    }

    // Skip for dependabot PRs
    if (actor === 'dependabot[bot]' || headRef.startsWith('dependabot/')) {
      console.debug('ℹ️ Dependabot PR detected, skipping changeset check.');
      return true;
    }

    // Skip if skip label is found in title, body, or labels
    const hasSkipLabelInText =
      prTitle.includes(skipLabel) || prBody.includes(skipLabel);
    const hasSkipLabelInLabels = payload.pull_request?.labels?.some(
      (label) => label.name === skipLabel,
    );

    if (hasSkipLabelInText || hasSkipLabelInLabels) {
      console.debug(
        'ℹ️ Skip label detected in PR title, body or labels, skipping changeset check.',
      );
      return true;
    }

    return false;
  }

  async fetchBranches(baseRef, headRef) {
    console.debug(`🔄 Fetching branches...`);

    await this.gitUtil.fetchBranch(baseRef);
    if (headRef) {
      await this.gitUtil.fetchBranch(headRef);
    }
  }

  getChangedFiles(baseRef, headRef, baseSha, headSha) {
    console.debug('🔍 Setting up git references for PR context...');
    console.debug(`Head ref: ${headRef}`);
    console.debug(`Base ref: ${baseRef}`);
    console.debug(`Comparing ${baseSha} (base) to ${headSha} (head)`);

    console.debug('');
    console.debug('🔍 Checking for changesets in this PR...');
    console.debug('Changed files in this PR:');

    const changedFiles = this.gitUtil.getChangedFilesBetweenRefs(
      baseRef,
      headRef,
      baseSha,
      headSha,
    );
    console.debug(changedFiles.join('\n'));

    return changedFiles;
  }

  findChangesetFiles(files) {
    return files.filter((file) => file.match(/^\.changeset\/.*\.md$/));
  }

  async validateChangeset(context, options = {}) {
    const { skipLabel = '[skip changeset check]', fetchBranches = true } =
      options;

    const result = {
      shouldSkip: false,
      changedFiles: [],
      changesetFiles: [],
      hasChangeset: false,
      skipReason: null,
      error: null,
    };

    try {
      // Check if we should skip
      if (this.shouldSkipCheck(context, skipLabel)) {
        result.shouldSkip = true;
        result.skipReason =
          'Skip condition met (not PR, bot, release, or skip label)';
        return result;
      }

      const baseRef = context.payload.pull_request?.base?.ref || 'main';
      const headRef = context.payload.pull_request?.head?.ref || '';
      const baseSha = context.payload.pull_request?.base?.sha || '';
      const headSha = context.payload.pull_request?.head?.sha || '';

      // Fetch branches if requested
      if (fetchBranches) {
        this.fetchBranches(baseRef, headRef);
      }

      // Get changed files
      result.changedFiles = this.getChangedFiles(
        baseRef,
        headRef,
        baseSha,
        headSha,
      );

      // Find changeset files
      result.changesetFiles = this.findChangesetFiles(result.changedFiles);
      result.hasChangeset = result.changesetFiles.length > 0;

      return result;
    } catch (error) {
      result.error = error.message;
      return result;
    }
  }

  generateErrorMessage() {
    return [
      '',
      '❌ ERROR: No changeset found for this PR!',
      '',
      "📝 This PR modifies code but doesn't include a changeset.",
      '   Changesets are required to track version bumps and generate changelogs.',
      '',
      '🔧 To fix this:',
      '   1. Run: pnpm changeset',
      '   2. Follow the prompts to describe your changes',
      '   3. Commit the generated .changeset/*.md file',
      '',
      '💡 Learn more: https://github.com/changesets/changesets',
      '',
    ].join('\n');
  }
}
