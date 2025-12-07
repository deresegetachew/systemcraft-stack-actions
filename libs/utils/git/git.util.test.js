import assert from 'node:assert';
import { describe, beforeEach, mock, afterEach, it } from 'node:test';

import { GitUtil } from './git.util.js';

describe('GitUtil', () => {
  let mockShellService;
  let gitService;

  beforeEach(() => {
    mockShellService = {
      exec: mock.fn(() => ({ stdout: 'file1.js\nfile2.js\n' })),
      run: mock.fn(),
    };
    gitService = new GitUtil(mockShellService);
  });

  afterEach(() => {
    mock.restoreAll();
  });

  it('should return changed files from HEAD~1..HEAD command', async () => {
    // -- Arrange
    mockShellService.exec.mock.mockImplementation(() => ({
      stdout: 'packages/lib-one/package.json\npackages/lib-one/CHANGELOG.md\n',
    }));

    // -- Act
    const result = await gitService.getChangedFiles();

    // -- Assert
    assert.deepStrictEqual(result, [
      'packages/lib-one/package.json',
      'packages/lib-one/CHANGELOG.md',
    ]);
    assert.ok(
      mockShellService.exec.mock.calls[0].arguments[0].includes('HEAD~1..HEAD'),
    );
  });

  it('should fallback to HEAD^..HEAD if first command fails', async () => {
    // -- Arrange
    let callCount = 0;
    mockShellService.exec.mock.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        throw new Error('Command failed');
      }
      return { stdout: 'file1.js\nfile2.js\n' };
    });

    // -- Act
    const result = await gitService.getChangedFiles();

    // -- Assert
    assert.deepStrictEqual(result, ['file1.js', 'file2.js']);
    assert.strictEqual(mockShellService.exec.mock.callCount(), 2);
  });

  it('should return empty array if both commands fail', async () => {
    // -- Arrange
    mockShellService.exec.mock.mockImplementation(() => {
      throw new Error('Git command failed');
    });

    // -- Act
    const result = await gitService.getChangedFiles();

    // -- Assert
    assert.deepStrictEqual(result, []);
    assert.strictEqual(mockShellService.exec.mock.callCount(), 2);
  });

  it('should check remote branch existence', () => {
    // -- Arrange
    mockShellService.exec.mock.mockImplementation(() => ({
      stdout: 'origin/feature-branch\n',
    }));

    // -- Act
    const exists = gitService.checkRemoteBranch('feature-branch');

    // -- Assert
    assert.strictEqual(exists, true);
    assert.ok(
      mockShellService.exec.mock.calls[0].arguments[0].includes(
        'git ls-remote',
      ),
    );
  });

  it('should return false for non-existent remote branch', () => {
    // -- Arrange
    mockShellService.exec.mock.mockImplementation(() => ({ stdout: '' }));

    // -- Act
    const exists = gitService.checkRemoteBranch('non-existent');

    // -- Assert
    assert.strictEqual(exists, false);
  });

  it('should push tags to remote with --follow-tags', () => {
    // -- Arrange & Act
    gitService.pushTags();

    // -- Assert
    assert.strictEqual(mockShellService.exec.mock.callCount(), 1);
    assert.strictEqual(
      mockShellService.exec.mock.calls[0].arguments[0],
      'git push --follow-tags',
    );
  });

  it('should add files to git staging with default path', () => {
    // -- Arrange & Act
    gitService.gitAdd();

    // -- Assert
    assert.strictEqual(mockShellService.exec.mock.callCount(), 1);
    assert.strictEqual(
      mockShellService.exec.mock.calls[0].arguments[0],
      'git add .',
    );
  });

  it('should add specific files to git staging', () => {
    // -- Arrange & Act
    gitService.gitAdd('src/*.js');

    // -- Assert
    assert.strictEqual(mockShellService.exec.mock.callCount(), 1);
    assert.strictEqual(
      mockShellService.exec.mock.calls[0].arguments[0],
      'git add src/*.js',
    );
  });

  it('should commit with message', () => {
    // -- Arrange & Act
    gitService.gitCommit('test commit message');

    // -- Assert
    assert.strictEqual(mockShellService.exec.mock.callCount(), 1);
    assert.strictEqual(
      mockShellService.exec.mock.calls[0].arguments[0],
      'git commit -m "test commit message"',
    );
  });

  it('should stash with message and path', () => {
    // -- Arrange & Act
    gitService.gitStashPush('my-stash-message', '.release-meta/file.json');

    // -- Assert
    assert.strictEqual(mockShellService.exec.mock.callCount(), 1);
    assert.strictEqual(
      mockShellService.exec.mock.calls[0].arguments[0],
      'git stash push -m "my-stash-message" -- .release-meta/file.json',
    );
  });

  it('should stash with message only', () => {
    // -- Arrange & Act
    gitService.gitStashPush('my-stash-message');

    // -- Assert
    assert.strictEqual(mockShellService.exec.mock.callCount(), 1);
    assert.strictEqual(
      mockShellService.exec.mock.calls[0].arguments[0],
      'git stash push -m "my-stash-message"',
    );
  });

  it('should pop stash by name', () => {
    // -- Arrange & Act
    gitService.gitStashPop('stash@{0}');

    // -- Assert
    assert.strictEqual(mockShellService.exec.mock.callCount(), 1);
    assert.strictEqual(
      mockShellService.exec.mock.calls[0].arguments[0],
      'git stash pop stash@{0}',
    );
  });

  it('should list stashes', () => {
    // -- Arrange
    mockShellService.exec.mock.mockImplementation(() => ({
      stdout:
        'stash@{0}: On main: my-stash\nstash@{1}: On main: another-stash\n',
    }));

    // -- Act
    const stashList = gitService.gitStashList();

    // -- Assert
    assert.strictEqual(mockShellService.exec.mock.callCount(), 1);
    assert.strictEqual(
      mockShellService.exec.mock.calls[0].arguments[0],
      'git stash list',
    );
    assert.strictEqual(
      stashList,
      'stash@{0}: On main: my-stash\nstash@{1}: On main: another-stash',
    );
  });
});
