#!/usr/bin/env node
import { createRequire as __WEBPACK_EXTERNAL_createRequire } from "module";
/******/ var __webpack_modules__ = ({

/***/ 24:
/***/ ((module) => {

module.exports = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("node:fs");

/***/ }),

/***/ 760:
/***/ ((module) => {

module.exports = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("node:path");

/***/ }),

/***/ 347:
/***/ ((__webpack_module__, __webpack_exports__, __nccwpck_require__) => {

__nccwpck_require__.a(__webpack_module__, async (__webpack_handle_async_dependencies__, __webpack_async_result__) => { try {
/* harmony export */ __nccwpck_require__.d(__webpack_exports__, {
/* harmony export */   i: () => (/* binding */ main)
/* harmony export */ });
/* harmony import */ var node_fs__WEBPACK_IMPORTED_MODULE_0__ = __nccwpck_require__(24);
/* harmony import */ var _libs_utils_index_js__WEBPACK_IMPORTED_MODULE_1__ = __nccwpck_require__(36);
/* harmony import */ var _services_maintenance_plan_service_js__WEBPACK_IMPORTED_MODULE_2__ = __nccwpck_require__(586);

/**This file will run if there are changesets to process */







// Main function with default dependencies
async function main(
  env = process.env,
  fsApi = node_fs__WEBPACK_IMPORTED_MODULE_0__,
  shellUtil = new _libs_utils_index_js__WEBPACK_IMPORTED_MODULE_1__/* .ShellUtil */ .Rs(),
) {
  const maintenancePlanService = _services_maintenance_plan_service_js__WEBPACK_IMPORTED_MODULE_2__/* .MaintenancePlanService */ .O.create(
    shellUtil,
    fsApi,
  );
  return await maintenancePlanService.run(env);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await main();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

__webpack_async_result__();
} catch(e) { __webpack_async_result__(e); } }, 1);

/***/ }),

/***/ 586:
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __nccwpck_require__) => {

/* harmony export */ __nccwpck_require__.d(__webpack_exports__, {
/* harmony export */   O: () => (/* binding */ MaintenancePlanService)
/* harmony export */ });
/* unused harmony export createMaintenancePlanService */
/* harmony import */ var node_path__WEBPACK_IMPORTED_MODULE_0__ = __nccwpck_require__(760);
/* harmony import */ var _systemcraft_stack_actions_utils__WEBPACK_IMPORTED_MODULE_1__ = __nccwpck_require__(36);



class MaintenancePlanService {
  constructor(shellUtil, fsApi, gitUtil) {
    this.shell = shellUtil;
    this.fs = fsApi;
    this.git = gitUtil || new _systemcraft_stack_actions_utils__WEBPACK_IMPORTED_MODULE_1__/* .GitUtil */ .Hc(this.shell);
  }

  static create(shell, fsApi) {
    return new MaintenancePlanService(shell, fsApi);
  }

  getMajorBumpPackages(baseDir) {
    const files = (0,_systemcraft_stack_actions_utils__WEBPACK_IMPORTED_MODULE_1__/* .loadChangesetFiles */ .kK)(this.fs, baseDir);
    if (files.length === 0) {
      console.debug('ℹ️ No changesets found.');
      return new Set();
    }
    return _systemcraft_stack_actions_utils__WEBPACK_IMPORTED_MODULE_1__/* .PackageUtil */ .Nb.extractMajorBumpPackagesFromChangesets(files);
  }

  generateMaintenancePlan(majorBumpPackages, baseDir) {
    const plan = {};

    for (const packageName of majorBumpPackages) {
      const pkgInfo = (0,_systemcraft_stack_actions_utils__WEBPACK_IMPORTED_MODULE_1__/* .getPackageInfo */ .rP)(packageName, this.fs, baseDir);
      if (!pkgInfo) {
        console.warn(
          `⚠️ Package info not found for ${packageName}. Skipping...`,
        );
        continue;
      }

      const branchName = `release/${pkgInfo.dirName}@${pkgInfo.version}`;
      plan[packageName] = {
        branchName,
        version: pkgInfo.version,
        dirName: pkgInfo.dirName,
      };
      console.debug(`📋 Planned maintenance branch: ${branchName}`);
    }

    return plan;
  }

  writePlanFile(plan, baseDir) {
    const releaseMetaDir = node_path__WEBPACK_IMPORTED_MODULE_0__.resolve(baseDir, '.release-meta');
    const planFilePath = node_path__WEBPACK_IMPORTED_MODULE_0__.join(releaseMetaDir, 'maintenance-branches.json');

    if (!this.fs.existsSync(releaseMetaDir)) {
      this.fs.mkdirSync(releaseMetaDir, { recursive: true });
    }

    this.fs.writeFileSync(planFilePath, JSON.stringify(plan, null, 2), 'utf-8');
    console.debug(`✅ Plan written to: ${planFilePath}`);
  }

  stashPlanFile() {
    const stashMessage = 'systemcraft-maintenance-file-stash';
    const planFilePath = '.release-meta/maintenance-branches.json';

    console.debug('📦 Stashing maintenance plan file...');
    this.git.gitAdd(planFilePath);
    this.git.gitStashPush(stashMessage, planFilePath);
    console.debug(`✅ Plan file stashed with message: ${stashMessage}`);
  }

  async run(env = process.env, baseDir = process.cwd()) {
    console.debug('🔄 Starting version script...');

    const majorBumpPackages = this.getMajorBumpPackages(baseDir);

    if (majorBumpPackages.size === 0) {
      console.debug(
        'ℹ️ No major version bumps detected. Writing empty plan file.',
      );
      this.writePlanFile({}, baseDir);
      this.stashPlanFile();
      return;
    }

    console.debug(
      `🔍 Major bump packages detected: ${Array.from(majorBumpPackages).join(', ')}`,
    );

    const plan = this.generateMaintenancePlan(majorBumpPackages, baseDir);
    this.writePlanFile(plan, baseDir);
    this.stashPlanFile();

    this.git.gitStatus();
    console.debug('✅ Version script completed successfully.');
  }
}

// Legacy function export for backward compatibility
function createMaintenancePlanService(shell, fsApi) {
  return MaintenancePlanService.create(shell, fsApi);
}


/***/ }),

/***/ 36:
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __nccwpck_require__) => {


// EXPORTS
__nccwpck_require__.d(__webpack_exports__, {
  Hc: () => (/* reexport */ GitUtil),
  Nb: () => (/* reexport */ PackageUtil),
  Rs: () => (/* reexport */ ShellUtil),
  rP: () => (/* reexport */ getPackageInfo),
  kK: () => (/* reexport */ loadChangesetFiles)
});

// UNUSED EXPORTS: FSUtil, extractMajorBumpPackagesFromChangesets, getActionInput, getBooleanActionInput, sanitizePackageDir

// EXTERNAL MODULE: external "node:fs"
var external_node_fs_ = __nccwpck_require__(24);
var external_node_fs_namespaceObject = /*#__PURE__*/__nccwpck_require__.t(external_node_fs_, 2);
// EXTERNAL MODULE: external "node:path"
var external_node_path_ = __nccwpck_require__(760);
;// CONCATENATED MODULE: ../../libs/utils/fs/fs.util.js



/**
 * File system utility class for async file operations with helper functionalities
 * 
 * @class FSUtil
 * @description Provides convenient async file system operations with proper error handling

 * @example
 * const fsUtil = new FSUtil();
 * await fsUtil.ensureDir('/path/to/directory');
 * const exists = await fsUtil.exists('/path/to/file');
 */
class FSUtil {
  /**
   * Create an FSUtil instance
   * @param {Object} [fsApi=fs] - File system promises API (allows dependency injection for testing)
   * @param {Function} fsApi.mkdir - Create directory function
   * @param {Function} fsApi.access - Check file access function
   * @param {Function} fsApi.readFile - Read file function
   */
  constructor(fsApi = fs) {
    /** @private {Object} File system promises API for async operations */
    this.fs = fsApi;
  }

  /**
   * Static factory method to create FSUtil instance
   * @static
   * @method create
   * @param {Object} fsApi - File system API to use
   * @returns {FSUtil} New FSUtil instance
   * @example
   * const fsUtil = FSUtil.create(customFsApi);
   */
  static create(fsApi) {
    return new FSUtil(fsApi);
  }

  /**
   * Ensure directory exists, creating it and parent directories if necessary
   *
   * @async
   * @method ensureDir
   * @param {string} dirPath - Path to directory to create
   * @throws {Error} If directory creation fails due to permissions or other issues
   *
   * @example
   * await fsUtil.ensureDir('/path/to/nested/directory');
   */
  async ensureDir(dirPath) {
    await this.fs.mkdir(dirPath, { recursive: true });
  }

  /**
   * Check if a file or directory exists
   *
   * @async
   * @method exists
   * @param {string} path - Path to check for existence
   * @returns {Promise<boolean>} True if path exists, false otherwise
   *
   * @example
   * const exists = await fsUtil.exists('/path/to/file.txt');
   * if (exists) console.debug('File exists');
   */
  async exists(path) {
    try {
      await this.fs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get package name from package.json, with fallback to directory name
   *
   * @async
   * @method getPackageName
   * @param {string} pkgDir - Directory containing package.json
   * @returns {Promise<string>} Package name from package.json or directory basename
   *
   * @description
   * Attempts to read package.json and extract the name field.
   * If package.json doesn't exist or is invalid, returns the directory basename.
   *
   * @example
   * const name = await fsUtil.getPackageName('/project/packages/utils');
   * // Returns: '@myorg/utils' (from package.json) or 'utils' (fallback)
   */
  async getPackageName(pkgDir) {
    try {
      const pkgJson = JSON.parse(
        await this.fs.readFile(path.join(pkgDir, 'package.json'), 'utf8'),
      );
      if (pkgJson && typeof pkgJson.name === 'string') return pkgJson.name;
    } catch {
      // ignore
    }
    return path.basename(pkgDir);
  }
}

;// CONCATENATED MODULE: ../../libs/utils/git/git.util.js


class GitUtil {
  constructor(shellService, githubToken = null, fsApi = null) {
    this.shell = shellService;
    this.githubToken = githubToken;
    this.fs = fsApi || external_node_fs_namespaceObject;
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

;// CONCATENATED MODULE: ../../libs/utils/package/package.util.js


/**
 * Package utility class for handling monorepo package operations and changeset processing
 * 
 * @class PackageUtil
 * @description Provides utilities for reading package information, processing changesets, and managing monorepo packages

 * @example
 * const fs = require('node:fs');
 * const packageUtil = new PackageUtil(fs);
 * const info = packageUtil.getPackageInfo('@scope/package', '/project/root');
 */
class PackageUtil {
  /**
   * Create a PackageUtil instance
   * @param {Object} fsApi - File system API (typically Node.js fs module)
   * @param {Function} fsApi.existsSync - Check if file/directory exists
   * @param {Function} fsApi.readFileSync - Read file contents synchronously
   * @param {Function} fsApi.readdirSync - Read directory contents synchronously
   */
  constructor(fsApi) {
    /** @private {Object} File system API for file operations */
    this.fs = fsApi;
  }

  /**
   * Get package information from package.json
   *
   * @method getPackageInfo
   * @param {string} packageName - Name of the package (e.g., '@scope/package-name')
   * @param {string} baseDir - Base directory of the monorepo
   * @returns {Object|null} Package information object or null if not found
   * @returns {string} returns.version - Package version from package.json
   * @returns {string} returns.dirName - Directory name of the package
   *
   * @example
   * const info = packageUtil.getPackageInfo('@myorg/utils', '/project');
   * // Returns: { version: '1.2.3', dirName: 'utils' }
   */
  getPackageInfo(packageName, baseDir) {
    const packageDirName = packageName.split('/').pop();
    const packagePath = external_node_path_.resolve(baseDir, 'packages', packageDirName);
    const packageJsonPath = external_node_path_.join(packagePath, 'package.json');

    if (!this.fs.existsSync(packageJsonPath)) {
      return null;
    }

    const packageJson = JSON.parse(
      this.fs.readFileSync(packageJsonPath, 'utf-8'),
    );
    return {
      version: packageJson.version,
      dirName: packageDirName,
    };
  }

  /**
   * Load all changeset files from the .changeset directory
   *
   * @method loadChangesetFiles
   * @param {string} baseDir - Base directory of the monorepo
   * @returns {Array<Object>} Array of changeset file objects
   * @returns {string} returns[].filename - Name of the changeset file
   * @returns {string} returns[].content - Content of the changeset file
   *
   * @example
   * const changesets = packageUtil.loadChangesetFiles('/project');
   * // Returns: [{ filename: 'feature.md', content: '---\n"@myorg/utils": minor\n---\n\nAdd new utility' }]
   */
  loadChangesetFiles(baseDir) {
    const changesetsDir = external_node_path_.resolve(baseDir, '.changeset');

    if (!this.fs.existsSync(changesetsDir)) {
      return [];
    }

    return this.fs
      .readdirSync(changesetsDir)
      .filter((f) => f.endsWith('.md') && f !== 'README.md')
      .map((filename) => ({
        filename,
        content: this.fs.readFileSync(
          external_node_path_.join(changesetsDir, filename),
          'utf-8',
        ),
      }));
  }

  /**
   * Extract packages that have major version bumps from changeset files
   *
   * @static
   * @method extractMajorBumpPackagesFromChangesets
   * @param {Array<Object>} changesetFiles - Array of changeset file objects
   * @param {string} changesetFiles[].content - Content of the changeset file
   * @returns {Set<string>} Set of package names that have major bumps
   *
   * @description
   * Parses changeset files to find packages marked for major version bumps.
   * Looks for lines matching pattern: "package-name": major
   *
   * @example
   * const changesets = [{ content: '"@myorg/utils": major\n"@myorg/core": minor' }];
   * const majorPackages = PackageUtil.extractMajorBumpPackagesFromChangesets(changesets);
   * // Returns: Set(['@myorg/utils'])
   */
  static extractMajorBumpPackagesFromChangesets(changesetFiles) {
    const majorBumpPackages = new Set();

    for (const { content } of changesetFiles) {
      const lines = content.split('\n');
      for (const line of lines) {
        if (line.includes(': major')) {
          // This regex looks for a quoted package name followed by ": major" (e.g., "@scope/pkg": major)
          const match = line.match(/"([^"]+)"\s*:\s*major/);
          const packageName = match ? match[1] : null;
          if (packageName) {
            majorBumpPackages.add(packageName);
          }
        }
      }
    }
    return majorBumpPackages;
  }

  /**
   * Sanitize package name for use as directory/file name
   *
   * @static
   * @method sanitizePackageDir
   * @param {string} nameOrDir - Package name or directory name to sanitize
   * @returns {string} Sanitized name safe for file system use
   *
   * @description
   * Converts package names with special characters to file-system safe names:
   * - Replaces '@' with 'at-'
   * - Replaces '/' with '__'
   *
   * @example
   * const safe = PackageUtil.sanitizePackageDir('@myorg/utils');
   * // Returns: 'at-myorg__utils'
   */
  static sanitizePackageDir(nameOrDir) {
    // turn @scope/pkg -> at-scope__pkg (safe for artifact folder names)
    return nameOrDir.replaceAll('@', 'at-').replaceAll('/', '__');
  }
}

// Function exports for application code
/**
 * Get package information using functional interface
 * @function getPackageInfo
 * @param {string} packageName - Name of the package
 * @param {Object} fsApi - File system API
 * @param {string} baseDir - Base directory of monorepo
 * @returns {Object|null} Package information or null
 */
function getPackageInfo(packageName, fsApi, baseDir) {
  const packageUtil = new PackageUtil(fsApi);
  return packageUtil.getPackageInfo(packageName, baseDir);
}

/**
 * Load changeset files using functional interface
 * @function loadChangesetFiles
 * @param {Object} fsApi - File system API
 * @param {string} baseDir - Base directory of monorepo
 * @returns {Array<Object>} Array of changeset file objects
 */
function loadChangesetFiles(fsApi, baseDir) {
  const packageUtil = new PackageUtil(fsApi);
  return packageUtil.loadChangesetFiles(baseDir);
}

/**
 * Extract major bump packages using functional interface
 * @function extractMajorBumpPackagesFromChangesets
 * @param {Array<Object>} changesetFiles - Array of changeset file objects
 * @returns {Set<string>} Set of package names with major bumps
 */
function extractMajorBumpPackagesFromChangesets(changesetFiles) {
  return PackageUtil.extractMajorBumpPackagesFromChangesets(changesetFiles);
}

/**
 * Sanitize package directory name using functional interface
 * @function sanitizePackageDir
 * @param {string} nameOrDir - Package name to sanitize
 * @returns {string} Sanitized name
 */
function sanitizePackageDir(nameOrDir) {
  return PackageUtil.sanitizePackageDir(nameOrDir);
}

;// CONCATENATED MODULE: external "node:child_process"
const external_node_child_process_namespaceObject = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("node:child_process");
var external_node_child_process_namespaceObject_0 = /*#__PURE__*/__nccwpck_require__.t(external_node_child_process_namespaceObject, 2);
;// CONCATENATED MODULE: external "node:process"
const external_node_process_namespaceObject = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("node:process");
;// CONCATENATED MODULE: ../../libs/utils/shell/shell.util.js



/**
 * Shell utility class for executing system commands with consistent error handling
 * 
 * @class ShellUtil
 * @description Provides a simplified interface for running shell commands with proper error handling and output capture

 * @example
 * const shell = new ShellUtil();
 * const result = shell.exec('git status');
 * console.debug(result.stdout);
 */
class ShellUtil {
  /**
   * Create a ShellUtil instance
   * @param {Object} [cpApi=cp] - Child process API to use (allows dependency injection for testing)
   * @param {Function} cpApi.execSync - Synchronous command execution function
   */
  constructor(cpApi = external_node_child_process_namespaceObject_0) {
    /** @private {Object} Child process API for command execution */
    this.cp = cpApi;
  }

  /**
   * Execute a shell command synchronously with error handling
   *
   * @method exec
   * @param {string} command - The shell command to execute
   * @param {Object} [options={}] - Options to pass to execSync
   * @param {string|Array} [options.stdio='inherit'] - How to handle stdin/stdout/stderr
   * @param {string} [options.cwd] - Current working directory for the command
   * @param {Object} [options.env] - Environment variables for the command
   * @returns {Object} Result object with stdout property
   * @returns {string} returns.stdout - The command's stdout output as string
   * @throws {Error} When stdio is 'pipe' and command fails (allows caller error handling)
   *
   * @description
   * Executes shell commands with consistent logging and error handling:
   * - Logs the command being executed
   * - With default stdio='inherit': Shows output in real-time, exits process on error
   * - With stdio='pipe': Captures output, throws error for caller to handle
   * - Returns stdout as string for further processing
   *
   * @example
   * // Execute with real-time output (default)
   * shell.exec('npm install');
   *
   * @example
   * // Capture output for processing
   * const result = shell.exec('git status --porcelain', { stdio: 'pipe' });
   * const files = result.stdout.split('\n').filter(Boolean);
   *
   * @example
   * // Handle errors when capturing output
   * try {
   *   const result = shell.exec('git diff --name-only', { stdio: 'pipe' });
   *   console.debug('Changed files:', result.stdout);
   * } catch (error) {
   *   console.debug('No changes or git error');
   * }
   */
  exec(command, options = {}) {
    console.debug(`> ${command}`);
    try {
      const output = this.cp.execSync(command, {
        stdio: 'inherit',
        ...options,
      });

      if (output === null || output === undefined) return { stdout: '' };

      return { stdout: output.toString() };
    } catch (e) {
      console.error(`❌ Command failed: ${command}`);
      // If stdio is 'pipe', throw error to allow caller to handle it
      if (options.stdio === 'pipe') {
        throw e;
      }
      external_node_process_namespaceObject.exit(1);
    }
  }
}

;// CONCATENATED MODULE: ../../libs/utils/index.js







/***/ })

/******/ });
/************************************************************************/
/******/ // The module cache
/******/ var __webpack_module_cache__ = {};
/******/ 
/******/ // The require function
/******/ function __nccwpck_require__(moduleId) {
/******/ 	// Check if module is in cache
/******/ 	var cachedModule = __webpack_module_cache__[moduleId];
/******/ 	if (cachedModule !== undefined) {
/******/ 		return cachedModule.exports;
/******/ 	}
/******/ 	// Create a new module (and put it into the cache)
/******/ 	var module = __webpack_module_cache__[moduleId] = {
/******/ 		// no module.id needed
/******/ 		// no module.loaded needed
/******/ 		exports: {}
/******/ 	};
/******/ 
/******/ 	// Execute the module function
/******/ 	var threw = true;
/******/ 	try {
/******/ 		__webpack_modules__[moduleId](module, module.exports, __nccwpck_require__);
/******/ 		threw = false;
/******/ 	} finally {
/******/ 		if(threw) delete __webpack_module_cache__[moduleId];
/******/ 	}
/******/ 
/******/ 	// Return the exports of the module
/******/ 	return module.exports;
/******/ }
/******/ 
/************************************************************************/
/******/ /* webpack/runtime/async module */
/******/ (() => {
/******/ 	var webpackQueues = typeof Symbol === "function" ? Symbol("webpack queues") : "__webpack_queues__";
/******/ 	var webpackExports = typeof Symbol === "function" ? Symbol("webpack exports") : "__webpack_exports__";
/******/ 	var webpackError = typeof Symbol === "function" ? Symbol("webpack error") : "__webpack_error__";
/******/ 	var resolveQueue = (queue) => {
/******/ 		if(queue && queue.d < 1) {
/******/ 			queue.d = 1;
/******/ 			queue.forEach((fn) => (fn.r--));
/******/ 			queue.forEach((fn) => (fn.r-- ? fn.r++ : fn()));
/******/ 		}
/******/ 	}
/******/ 	var wrapDeps = (deps) => (deps.map((dep) => {
/******/ 		if(dep !== null && typeof dep === "object") {
/******/ 			if(dep[webpackQueues]) return dep;
/******/ 			if(dep.then) {
/******/ 				var queue = [];
/******/ 				queue.d = 0;
/******/ 				dep.then((r) => {
/******/ 					obj[webpackExports] = r;
/******/ 					resolveQueue(queue);
/******/ 				}, (e) => {
/******/ 					obj[webpackError] = e;
/******/ 					resolveQueue(queue);
/******/ 				});
/******/ 				var obj = {};
/******/ 				obj[webpackQueues] = (fn) => (fn(queue));
/******/ 				return obj;
/******/ 			}
/******/ 		}
/******/ 		var ret = {};
/******/ 		ret[webpackQueues] = x => {};
/******/ 		ret[webpackExports] = dep;
/******/ 		return ret;
/******/ 	}));
/******/ 	__nccwpck_require__.a = (module, body, hasAwait) => {
/******/ 		var queue;
/******/ 		hasAwait && ((queue = []).d = -1);
/******/ 		var depQueues = new Set();
/******/ 		var exports = module.exports;
/******/ 		var currentDeps;
/******/ 		var outerResolve;
/******/ 		var reject;
/******/ 		var promise = new Promise((resolve, rej) => {
/******/ 			reject = rej;
/******/ 			outerResolve = resolve;
/******/ 		});
/******/ 		promise[webpackExports] = exports;
/******/ 		promise[webpackQueues] = (fn) => (queue && fn(queue), depQueues.forEach(fn), promise["catch"](x => {}));
/******/ 		module.exports = promise;
/******/ 		body((deps) => {
/******/ 			currentDeps = wrapDeps(deps);
/******/ 			var fn;
/******/ 			var getResult = () => (currentDeps.map((d) => {
/******/ 				if(d[webpackError]) throw d[webpackError];
/******/ 				return d[webpackExports];
/******/ 			}))
/******/ 			var promise = new Promise((resolve) => {
/******/ 				fn = () => (resolve(getResult));
/******/ 				fn.r = 0;
/******/ 				var fnQueue = (q) => (q !== queue && !depQueues.has(q) && (depQueues.add(q), q && !q.d && (fn.r++, q.push(fn))));
/******/ 				currentDeps.map((dep) => (dep[webpackQueues](fnQueue)));
/******/ 			});
/******/ 			return fn.r ? promise : getResult();
/******/ 		}, (err) => ((err ? reject(promise[webpackError] = err) : outerResolve(exports)), resolveQueue(queue)));
/******/ 		queue && queue.d < 0 && (queue.d = 0);
/******/ 	};
/******/ })();
/******/ 
/******/ /* webpack/runtime/create fake namespace object */
/******/ (() => {
/******/ 	var getProto = Object.getPrototypeOf ? (obj) => (Object.getPrototypeOf(obj)) : (obj) => (obj.__proto__);
/******/ 	var leafPrototypes;
/******/ 	// create a fake namespace object
/******/ 	// mode & 1: value is a module id, require it
/******/ 	// mode & 2: merge all properties of value into the ns
/******/ 	// mode & 4: return value when already ns object
/******/ 	// mode & 16: return value when it's Promise-like
/******/ 	// mode & 8|1: behave like require
/******/ 	__nccwpck_require__.t = function(value, mode) {
/******/ 		if(mode & 1) value = this(value);
/******/ 		if(mode & 8) return value;
/******/ 		if(typeof value === 'object' && value) {
/******/ 			if((mode & 4) && value.__esModule) return value;
/******/ 			if((mode & 16) && typeof value.then === 'function') return value;
/******/ 		}
/******/ 		var ns = Object.create(null);
/******/ 		__nccwpck_require__.r(ns);
/******/ 		var def = {};
/******/ 		leafPrototypes = leafPrototypes || [null, getProto({}), getProto([]), getProto(getProto)];
/******/ 		for(var current = mode & 2 && value; typeof current == 'object' && !~leafPrototypes.indexOf(current); current = getProto(current)) {
/******/ 			Object.getOwnPropertyNames(current).forEach((key) => (def[key] = () => (value[key])));
/******/ 		}
/******/ 		def['default'] = () => (value);
/******/ 		__nccwpck_require__.d(ns, def);
/******/ 		return ns;
/******/ 	};
/******/ })();
/******/ 
/******/ /* webpack/runtime/define property getters */
/******/ (() => {
/******/ 	// define getter functions for harmony exports
/******/ 	__nccwpck_require__.d = (exports, definition) => {
/******/ 		for(var key in definition) {
/******/ 			if(__nccwpck_require__.o(definition, key) && !__nccwpck_require__.o(exports, key)) {
/******/ 				Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 			}
/******/ 		}
/******/ 	};
/******/ })();
/******/ 
/******/ /* webpack/runtime/hasOwnProperty shorthand */
/******/ (() => {
/******/ 	__nccwpck_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ })();
/******/ 
/******/ /* webpack/runtime/make namespace object */
/******/ (() => {
/******/ 	// define __esModule on exports
/******/ 	__nccwpck_require__.r = (exports) => {
/******/ 		if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 			Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 		}
/******/ 		Object.defineProperty(exports, '__esModule', { value: true });
/******/ 	};
/******/ })();
/******/ 
/******/ /* webpack/runtime/compat */
/******/ 
/******/ if (typeof __nccwpck_require__ !== 'undefined') __nccwpck_require__.ab = new URL('.', import.meta.url).pathname.slice(import.meta.url.match(/^file:\/\/\/\w:/) ? 1 : 0, -1) + "/";
/******/ 
/************************************************************************/
/******/ 
/******/ // startup
/******/ // Load entry module and return exports
/******/ // This entry module used 'module' so it can't be inlined
/******/ var __webpack_exports__ = __nccwpck_require__(347);
/******/ __webpack_exports__ = await __webpack_exports__;
/******/ var __webpack_exports__main = __webpack_exports__.i;
/******/ export { __webpack_exports__main as main };
/******/ 
