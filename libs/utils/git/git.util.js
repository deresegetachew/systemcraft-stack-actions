export class GitUtil {
  constructor(shellService, githubToken = null) {
    this.shell = shellService;
    this.githubToken = githubToken;
  }

  async getChangedFiles() {
    const strategies = [
      'git diff --name-only HEAD~1..HEAD',
      'git diff --name-only HEAD^..HEAD',
    ];

    for (const command of strategies) {
      try {
        console.log(`Trying: ${command}`);
        const result = this.shell.exec(command, { stdio: 'pipe' });
        const files = result.stdout.split('\n').filter(Boolean);

        console.log(`result.stdout:\n${result.stdout}`);
        console.log(`Files changed:\n${files.join('\n')}`);

        if (files.length > 0) {
          console.log(
            `✅ Found ${files.length} changed files using: ${command}`,
          );
          return files;
        }
      } catch (error) {
        console.log(`❌ Failed: ${command} - ${error.message}`);
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

  pushBranch(branchName) {
    this.shell.exec(`git push origin ${branchName}`);
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
      console.log(`Trying diff strategy ${i + 1}...`);
      const result = strategies[i]();
      if (result && result.trim()) {
        const files = result.trim().split('\n').filter(Boolean);
        console.log(
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
    const headers = this.#buildRequestHeaders();

    // list artifacts
    const listReqURL = this.#buildRequestURI('list', { owner, repoName });

    console.log(`Fetching artifacts from ${listReqURL}`)

    const listResponse = await fetch(listReqURL, { headers });

    if (!listResponse.ok) {
      console.warn(
        `Warning: Failed to list artifacts (${listResponse.status} ${listResponse.statusText}).`,
      );
      return null;
    }

    const listData = await listResponse.json();
    const artifact = this.#findLatestArtifact(listData.artifacts);

    // download artifact
    const downloadURL = this.#buildRequestURI('download', {
      owner,
      repoName,
      artifactID: artifact.id,
    });
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
    return {
      Authorization: `Bearer ${this.githubToken}`,
      'User-Agent': 'coverage-collector-script',
      'X-GitHub-Api-Version': '2022-11-28',
      Accept: 'application/vnd.github+json',
    };
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
