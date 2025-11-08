import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

import { VersionService } from './version.service.js';

describe('VersionService', () => {
  let mockFsApi;
  let mockShellService;
  let versionService;
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };

    // Mock filesystem
    mockFsApi = {
      existsSync: mock.fn(() => true),
      readdirSync: mock.fn(() => ['major-bump.md']),
      readFileSync: mock.fn(),
      mkdirSync: mock.fn(),
      writeFileSync: mock.fn(),
    };

    // Mock shell service
    mockShellService = {
      run: mock.fn(() => ({ stdout: '' })),
    };

    versionService = VersionService.create(mockShellService, mockFsApi);
  });

  afterEach(() => {
    process.env = originalEnv;
    mock.restoreAll();
  });

  describe('getMajorBumpPackages', () => {
    it('should return empty set when no changesets exist', () => {
      mockFsApi.existsSync.mock.mockImplementation(() => false);

      const result = versionService.getMajorBumpPackages('/test/dir');

      assert.ok(result instanceof Set);
      assert.strictEqual(result.size, 0);
    });

    it('should return empty set when no major bumps are found', () => {
      mockFsApi.readFileSync.mock.mockImplementation(
        () => `
---
"@scope/lib-one": patch
---

Fix a small bug
            `,
      );

      const result = versionService.getMajorBumpPackages('/test/dir');

      assert.ok(result instanceof Set);
      assert.strictEqual(result.size, 0);
    });

    it('should return packages with major bumps', () => {
      mockFsApi.readFileSync.mock.mockImplementation(
        () => `
---
"@scope/lib-one": major
"@scope/lib-two": patch
---

Breaking changes in lib-one
            `,
      );

      const result = versionService.getMajorBumpPackages('/test/dir');

      assert.ok(result.has('@scope/lib-one'));
      assert.ok(!result.has('@scope/lib-two'));
      assert.strictEqual(result.size, 1);
    });
  });

  describe('generateMaintenancePlan', () => {
    it('should create maintenance plan for major bump packages', () => {
      const majorBumpPackages = new Set(['@scope/lib-one', '@scope/lib-two']);

      mockFsApi.readFileSync.mock.mockImplementation((path) => {
        if (path.includes('lib-one')) {
          return JSON.stringify({ name: '@scope/lib-one', version: '2.0.0' });
        } else if (path.includes('lib-two')) {
          return JSON.stringify({ name: '@scope/lib-two', version: '3.0.0' });
        }
      });

      const result = versionService.generateMaintenancePlan(
        majorBumpPackages,
        '/test/dir',
      );

      assert.ok(result['@scope/lib-one']);
      assert.ok(result['@scope/lib-two']);
      assert.strictEqual(result['@scope/lib-one'].version, '2.0.0');
      assert.strictEqual(result['@scope/lib-two'].version, '3.0.0');
      assert.ok(result['@scope/lib-one'].branchName.includes('lib-one'));
      assert.ok(result['@scope/lib-two'].branchName.includes('lib-two'));
    });

    it('should skip packages without package.json info', () => {
      const majorBumpPackages = new Set(['@scope/missing-package']);

      // Mock existsSync to return false when checking for package.json
      mockFsApi.existsSync.mock.mockImplementation((filePath) => {
        if (filePath.includes('package.json')) {
          return false; // Package doesn't exist
        }
        return true; // Other directories exist
      });

      const result = versionService.generateMaintenancePlan(
        majorBumpPackages,
        '/test/dir',
      );

      assert.deepStrictEqual(result, {});
    });
  });

  describe('writePlanFile', () => {
    it('should write plan to correct location', () => {
      const plan = {
        '@scope/lib-one': {
          branchName: 'release/lib-one@2.0.0',
          version: '2.0.0',
        },
      };
      mockFsApi.existsSync.mock.mockImplementation(() => true); // Directory exists

      versionService.writePlanFile(plan, '/test/dir');

      assert.strictEqual(mockFsApi.mkdirSync.mock.callCount(), 0); // Should not create directory
      assert.strictEqual(mockFsApi.writeFileSync.mock.callCount(), 1);

      const writeCall = mockFsApi.writeFileSync.mock.calls[0];
      const writtenContent = JSON.parse(writeCall.arguments[1]);
      assert.deepStrictEqual(writtenContent, plan);
    });

    it('should create release-meta directory if it does not exist', () => {
      mockFsApi.existsSync.mock.mockImplementation(() => false);

      const plan = {};
      versionService.writePlanFile(plan, '/test/dir');

      assert.strictEqual(mockFsApi.mkdirSync.mock.callCount(), 1);
      const mkdirCall = mockFsApi.mkdirSync.mock.calls[0];
      assert.ok(mkdirCall.arguments[0].includes('.release-meta'));
    });
  });

  describe('runChangesetVersion', () => {
    it('should execute changeset version command', () => {
      versionService.runChangesetVersion();

      assert.strictEqual(mockShellService.run.mock.callCount(), 1);
      assert.ok(
        mockShellService.run.mock.calls[0].arguments[0].includes(
          'changeset version',
        ),
      );
    });
  });

  describe('run', () => {
    it('should skip if no changesets are found', async () => {
      mockFsApi.existsSync.mock.mockImplementation(() => false);

      await versionService.run(process.env);

      assert.strictEqual(mockFsApi.writeFileSync.mock.callCount(), 1);
      assert.strictEqual(
        mockShellService.run.mock.callCount(),
        0,
        'Should not run changeset version',
      );
    });

    it('should write an empty plan file if no major bumps are detected', async () => {
      mockFsApi.readFileSync.mock.mockImplementation(
        () => `
---
"@scope/lib-one": patch
---

Fix a small bug
            `,
      );

      await versionService.run(process.env);

      assert.strictEqual(mockFsApi.writeFileSync.mock.callCount(), 1);
      const writeCall = mockFsApi.writeFileSync.mock.calls[0];
      const writtenContent = JSON.parse(writeCall.arguments[1]);
      assert.deepStrictEqual(writtenContent, {});
    });

    it('should plan a maintenance branch for a single major bump', async () => {
      mockFsApi.readFileSync.mock.mockImplementation((path) => {
        if (path.includes('.md')) {
          return `
---
"@scope/lib-one": major
---

Breaking change
                    `;
        } else if (path.includes('package.json')) {
          return JSON.stringify({
            name: '@scope/lib-one',
            version: '2.0.0',
          });
        }
      });

      await versionService.run(process.env);

      assert.strictEqual(mockFsApi.writeFileSync.mock.callCount(), 1);
      const writeCall = mockFsApi.writeFileSync.mock.calls[0];
      const writtenContent = JSON.parse(writeCall.arguments[1]);

      assert.ok(writtenContent['@scope/lib-one']);
      assert.strictEqual(writtenContent['@scope/lib-one'].version, '2.0.0');
      assert.ok(
        writtenContent['@scope/lib-one'].branchName.includes('lib-one'),
      );

      assert.strictEqual(mockShellService.run.mock.callCount(), 1);
      assert.ok(
        mockShellService.run.mock.calls[0].arguments[0].includes(
          'changeset version',
        ),
      );
    });

    it('should plan branches for multiple major bumps', async () => {
      mockFsApi.readdirSync.mock.mockImplementation(() => [
        'bump1.md',
        'bump2.md',
      ]);

      let readCount = 0;
      mockFsApi.readFileSync.mock.mockImplementation((path) => {
        if (path.includes('.md')) {
          readCount++;
          if (readCount === 1) {
            return `---\n"@scope/lib-one": major\n---\nBreaking change in lib-one`;
          } else {
            return `---\n"@scope/lib-two": major\n---\nBreaking change in lib-two`;
          }
        } else if (path.includes('lib-one')) {
          return JSON.stringify({ name: '@scope/lib-one', version: '2.0.0' });
        } else if (path.includes('lib-two')) {
          return JSON.stringify({ name: '@scope/lib-two', version: '3.0.0' });
        }
      });

      await versionService.run(process.env);

      assert.strictEqual(mockFsApi.writeFileSync.mock.callCount(), 1);
      const writeCall = mockFsApi.writeFileSync.mock.calls[0];
      const writtenContent = JSON.parse(writeCall.arguments[1]);

      assert.ok(writtenContent['@scope/lib-one']);
      assert.ok(writtenContent['@scope/lib-two']);
      assert.strictEqual(mockShellService.run.mock.callCount(), 1);
    });
  });

  describe('createVersionService (legacy)', () => {
    it('should create service instance', () => {
      const service =
        versionService.createVersionService?.(mockShellService, mockFsApi) ||
        VersionService.create(mockShellService, mockFsApi);

      assert.ok(service);
      assert.ok(service.run);
    });
  });
});
