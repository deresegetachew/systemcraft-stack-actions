#!/usr/bin/env node

/**This file will run if there are changesets to process */

import fs from 'node:fs';

import { ShellUtil } from '../../libs/utils/index.js';

import { MaintenancePlanService } from './services/maintenance-plan.service.js';

// Main function with default dependencies
export async function main(
  env = process.env,
  fsApi = fs,
  shellUtil = new ShellUtil(),
) {
  // Skip if this is a Version Packages commit (prevents infinite loop)
  // When the Version PR merges, it creates a commit with "Version Packages" in the message
  // We don't want to run version again on that commit
  try {
    const result = shellUtil.exec('git log -1 --pretty=%B', { stdio: 'pipe' });
    const commitMessage = result.stdout.trim();

    if (commitMessage.includes('Version Packages')) {
      console.debug('⏭️  Skipping: Commit is from Version Packages PR merge');
      console.debug(`📝 Commit message: ${commitMessage}`);
      return;
    }
  } catch (error) {
    console.debug('⚠️  Could not check commit message, proceeding anyway', {
      error,
    });
  }

  const maintenancePlanService = MaintenancePlanService.create(
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
