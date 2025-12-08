import * as fs from 'node:fs';

export class GitUtil {
  constructor(shellService, githubToken = null, fsApi = null) {
    this.shell = shellService;
    this.githubToken = githubToken;
    this.fs = fsApi || fs;
    this.refreshEnvContext();
    this.lastArtifactHtmlUrl = null;
  }

  async getChangedFiles() {
    const strategies = [
      'git diff --name-only HEAD~1..HEAD',
      'git diff --name-only HEAD^..HEAD',
    ];

    for (const command of strategies) {
      try {
        console.debug(`Trying: ${command}`);
        const result = this.shell.exec(command, { stdio: 'pipe' });
        const files = result.stdout.split('\n').filter(Boolean);

        console.debug(`result.stdout:\n${result.stdout}`);
        console.debug(`Files changed:\n${files.join('\n')}`);

        if (files.length > 0) {
          console.debug(
            `✅ Found ${files.length} changed files using: ${command}`,
          );
          return files;
        }
      } catch (error) {
        console.debug(`❌ Failed: ${command} - ${error.message}`);
      }
    }

    console.warn('⚠️  No git strategy worked, returning empty array');
    return [];
  }

  checkRemoteBranch(branchName) {
    const result = this.shell.exec(
      `git ls-remote --heads origin ${branchName}`,
      { stdio: 'pipe' },
    );
    return result.stdout.trim() !== '';
  }

  createBranch(branchName, fromCommit = 'HEAD~1') {
    this.shell.exec(`git branch ${branchName} ${fromCommit}`);
  }

  getCurrentBranch() {
    const result = this.shell.exec('git branch --show-current', {
      stdio: 'pipe',
    });
    return result.stdout.trim();
  }

  checkoutBranch(branchName) {
    this.shell.exec(`git checkout ${branchName}`);
  }

  pushBranch(branchName) {
    this.shell.exec(`git push origin ${branchName}`);
  }

  pushTags() {
    console.debug('Pushing tags to remote...');
    this.shell.exec('git push --follow-tags');
    console.debug('✅ Tags pushed successfully.');
  }

  gitAdd(pathSpec = '.') {
    this.shell.exec(`git add ${pathSpec}`);
  }

  gitCommit(message) {
    this.shell.exec(`git commit -m "${message}"`);
  }

  gitStatus() {
    console.debug('Running git status...');
    this.shell.exec('git status');
    console.debug('�u2705 Git status Run.');
  }

  gitStashPush(message, pathSpec) {
    const cmd = pathSpec
      ? `git stash push -m "${message}" -- ${pathSpec}`
      : `git stash push -m "${message}"`;
    this.shell.exec(cmd);
  }

  gitStashPop(stashName) {
    this.shell.exec(`git stash pop ${stashName}`);
  }

  gitStashList() {
    const result = this.shell.exec('git stash list', { stdio: 'pipe' });
    return result.stdout.trim();
  }

  getChangedFilesBetweenRefs(baseRef, headRef, baseSha, headSha) {
    const strategies = [
      // Strategy 1: Use branch references (most reliable)
      () => {
        if (!headRef) return '';
        try {
          const result = this.shell.exec(
            `git diff --name-only origin/${baseRef}...origin/${headRef}`,
            { stdio: 'pipe' },
          );
          return result.stdout;
        } catch {
          return '';
        }
      },

      // Strategy 2: Use SHAs with three-dot syntax (finds merge base automatically)
      () => {
        if (!baseSha || !headSha) return '';
        try {
          const result = this.shell.exec(
            `git diff --name-only ${baseSha}...${headSha}`,
            { stdio: 'pipe' },
          );
          return result.stdout;
        } catch {
          return '';
        }
      },

      // Strategy 3: Use SHAs with two-dot syntax
      () => {
        if (!baseSha || !headSha) return '';
        try {
          const result = this.shell.exec(
            `git diff --name-only ${baseSha}..${headSha}`,
            { stdio: 'pipe' },
          );
          return result.stdout;
        } catch {
          return '';
        }
      },

      // Strategy 4: Compare HEAD to base branch
      () => {
        try {
          const result = this.shell.exec(
            `git diff --name-only origin/${baseRef}...HEAD`,
            { stdio: 'pipe' },
          );
          return result.stdout;
        } catch {
          return '';
        }
      },
    ];

    for (let i = 0; i < strategies.length; i++) {
      console.debug(`Trying diff strategy ${i + 1}...`);
      const result = strategies[i]();
      if (result && result.trim()) {
        const files = result.trim().split('\n').filter(Boolean);
        console.debug(
          `✅ Successfully got ${files.length} changed files using strategy ${i + 1}`,
        );
        return files;
      }
    }

    throw new Error('Could not get changed files with any method');
  }

  fetchBranch(ref) {
    try {
      this.shell.exec(`git fetch origin ${ref}`, { stdio: 'inherit' });
    } catch (error) {
      throw new Error(`Failed to fetch branch ${ref}: ${error.message}`);
    }
  }

  async downloadLatestArtifact({ owner, repoName, artifactName }, outputPath) {
    this.lastArtifactHtmlUrl = null;
    const headers = this.#buildRequestHeaders();

    // list artifacts
    const listReqURL = this.#buildRequestURI('list', {
      owner,
      repoName,
      artifactName,
    });

    console.debug(`Fetching artifacts from ${listReqURL}`);

    const listResponse = await fetch(listReqURL, { headers });

    if (!listResponse.ok) {
      console.warn(
        `Warning: Failed to list artifacts (${listResponse.status} ${listResponse.statusText}).`,
      );
      return null;
    }

    const listData = await listResponse.json();
    const artifact = this.#findLatestArtifact(listData.artifacts);

    console.debug(`Latest Artifact iD: ${artifact.id}`);

    // download artifact
    const downloadURL = this.#buildRequestURI('download', {
      owner,
      repoName,
      artifactID: artifact.id,
    });
    const serverUrl = process.env.GITHUB_SERVER_URL || 'https://github.com';
    this.lastArtifactHtmlUrl = `${serverUrl}/${owner}/${repoName}/actions/artifacts/${artifact.id}`;
    const downloadResponse = await fetch(downloadURL, {
      headers,
      redirect: 'follow',
    });

    if (!downloadResponse.ok) {
      console.warn(
        `Warning: Failed to download artifact (${downloadResponse.status} ${downloadResponse.statusText}).`,
      );
      return null;
    }

    return await downloadResponse.arrayBuffer();
  }

  #findLatestArtifact(artifacts) {
    if (!Array.isArray(artifacts) || artifacts.length === 0) {
      console.warn('Warning: No artifacts found.');
      return null;
    }

    console.debug(
      `artifacts found: ${artifacts.length}`,
      JSON.stringify({
        artifacts: artifacts.map((a) => ({
          name: a.name,
          expired: a.expired,
          workflow_run_conclusion: a?.workflow_run?.conclusion,
        })),
      }),
    );

    const matchingArtifacts = artifacts
      .filter(
        (artifact) =>
          !artifact.expired &&
          artifact.workflow_run &&
          this.#isArtifactRunSuccessful(artifact.workflow_run),
      )
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );

    if (matchingArtifacts.length === 0) {
      console.warn(`Warning: No active "${this.artifactName}" artifact found.`);
      return null;
    }

    console.log('matchingArtifacts:', matchingArtifacts[0]);

    return matchingArtifacts[0];
  }

  #isArtifactRunSuccessful(runInfo = {}) {
    // Some API responses omit conclusion, so treat missing as success unless explicitly failed/cancelled.
    const conclusion = runInfo.conclusion ?? 'success';
    return ![
      'failure',
      'cancelled',
      'timed_out',
      'action_required',
      'stale',
    ].includes(conclusion);
  }

  #buildRequestHeaders() {
    console.debug(`token: ${this.githubToken}`);

    return {
      Authorization: `Bearer ${this.githubToken}`,
      'User-Agent': 'coverage-collector-script',
      'X-GitHub-Api-Version': '2022-11-28',
      Accept: 'application/vnd.github+json',
    };
  }

  refreshEnvContext() {
    this.envContext = {
      repository: process.env.GITHUB_REPOSITORY || '',
      ref: process.env.GITHUB_REF || '',
      eventPath: process.env.GITHUB_EVENT_PATH || '',
      apiUrl: process.env.GITHUB_API_URL || 'https://api.github.com',
      token: this.githubToken || process.env.GITHUB_TOKEN || '',
    };
  }

  parseRepository(repo) {
    const [owner, repoName] = (repo || '').split('/');
    if (!owner || !repoName) {
      console.warn(`⚠️ Could not parse repository "${repo}"`);
      return null;
    }
    return { owner, repoName };
  }

  getPullRequestNumberFromEnv(fsApi = this.fs) {
    const fsImpl = fsApi || this.fs;
    try {
      const { eventPath } = this.envContext;
      if (eventPath && fsImpl.existsSync(eventPath)) {
        const eventData = JSON.parse(fsImpl.readFileSync(eventPath, 'utf8'));
        if (eventData?.pull_request?.number) {
          return eventData.pull_request.number;
        }
        if (eventData?.issue?.pull_request?.url && eventData?.issue?.number) {
          return eventData.issue.number;
        }
      }
    } catch (error) {
      console.warn(`⚠️ Failed to parse GITHUB_EVENT_PATH: ${error.message}`);
    }

    const ref = this.envContext.ref || '';
    const match = ref.match(/refs\/pull\/(\d+)\/merge/i);
    if (match) {
      return Number(match[1]);
    }

    return null;
  }

  async upsertPrComment({ body, marker = '<!-- coverage-reporter -->' }) {
    const prNumber = this.getPullRequestNumberFromEnv();
    const repoInfo = this.parseRepository(this.envContext.repository);
    const token = this.githubToken || this.envContext.token;

    if (!prNumber || !repoInfo || !token) {
      console.debug(
        '💬 Skipping PR comment: missing PR number, repo info, or GitHub token',
      );
      return false;
    }

    const apiUrl = this.envContext.apiUrl || 'https://api.github.com';
    const commentsUrl = `${apiUrl}/repos/${repoInfo.owner}/${repoInfo.repoName}/issues/${prNumber}/comments`;
    const headers = {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'coverage-reporter',
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    };

    const commentBody = marker ? `${marker}\n${body}` : body;

    try {
      let existingCommentId = null;

      const listResp = await fetch(`${commentsUrl}?per_page=100`, { headers });
      if (listResp.ok) {
        const comments = await listResp.json();
        const existing = comments.find((c) => c?.body?.includes(marker));
        if (existing) {
          existingCommentId = existing.id;
        }
      } else {
        console.warn(
          `⚠️ Unable to list PR comments (${listResp.status} ${listResp.statusText})`,
        );
      }

      if (existingCommentId) {
        const updateUrl = `${apiUrl}/repos/${repoInfo.owner}/${repoInfo.repoName}/issues/comments/${existingCommentId}`;
        const updateResp = await fetch(updateUrl, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ body: commentBody }),
        });
        if (!updateResp.ok) {
          console.warn(
            `⚠️ Failed to update PR comment (${updateResp.status} ${updateResp.statusText})`,
          );
          return false;
        }
        console.debug('💬 Updated existing coverage PR comment');
        return true;
      }

      const createResp = await fetch(commentsUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ body: commentBody }),
      });
      if (!createResp.ok) {
        console.warn(
          `⚠️ Failed to post PR comment (${createResp.status} ${createResp.statusText})`,
        );
        return false;
      }
      console.debug('💬 Posted coverage PR comment');
      return true;
    } catch (error) {
      console.warn(`⚠️ Failed to post PR comment: ${error.message}`);
      return false;
    }
  }

  #buildRequestURI(type, options) {
    const apiUrl = process.env.GITHUB_API_URL || 'https://api.github.com';

    switch (type) {
      case 'list': {
        const url = new URL(
          `${apiUrl}/repos/${options.owner}/${options.repoName}/actions/artifacts`,
        );
        url.searchParams.set('name', options.artifactName);
        url.searchParams.set('per_page', '100');

        return url;
      }
      case 'download': {
        return new URL(
          `${apiUrl}/repos/${options.owner}/${options.repoName}/actions/artifacts/${options.artifactID}/zip`,
        );
      }
      default:
        throw new Error(`Unknown request type: ${type}`);
    }
  }
}
