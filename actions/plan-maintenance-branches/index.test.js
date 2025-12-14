import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

import { main } from './index.js';

describe('main() - Entry Point', () => {
  let mockShellService;
  let mockFsApi;

  beforeEach(() => {
    mockShellService = {
      exec: mock.fn(() => ({ stdout: '' })),
    };

    mockFsApi = {
      existsSync: mock.fn(() => false),
      mkdirSync: mock.fn(),
      writeFileSync: mock.fn(),
    };
  });

  afterEach(() => {
    mock.restoreAll();
  });

  it('should skip when commit message contains "Version Packages"', async () => {
    mockShellService.exec.mock.mockImplementation((cmd) => {
      if (cmd.includes('git log')) {
        return { stdout: 'chore: Version Packages (#123)\n' };
      }
      return { stdout: '' };
    });

    await main(process.env, mockFsApi, mockShellService);

    // Should only call git log, not proceed with version logic
    assert.strictEqual(mockShellService.exec.mock.callCount(), 1);
    assert.ok(
      mockShellService.exec.mock.calls[0].arguments[0].includes('git log'),
    );
    // Should not write plan file
    assert.strictEqual(mockFsApi.writeFileSync.mock.callCount(), 0);
  });

  it('should proceed when commit message does not contain "Version Packages"', async () => {
    mockShellService.exec.mock.mockImplementation((cmd) => {
      if (cmd.includes('git log')) {
        return { stdout: 'feat: add new feature\n' };
      }
      return { stdout: '' };
    });

    await main(process.env, mockFsApi, mockShellService);

    // Should proceed with version logic and write plan file
    assert.ok(mockFsApi.writeFileSync.mock.callCount() > 0);
  });

  it('should proceed if git log fails', async () => {
    mockShellService.exec.mock.mockImplementation((cmd) => {
      if (cmd.includes('git log')) {
        throw new Error('git command failed');
      }
      return { stdout: '' };
    });

    await main(process.env, mockFsApi, mockShellService);

    // Should proceed with version logic despite git error
    assert.ok(mockFsApi.writeFileSync.mock.callCount() > 0);
  });
});
