#!/usr/bin/env node

/**This file will run if there are changesets to process */

import fs from 'node:fs';

import { ShellUtil } from '../../libs/utils/index.js';

import { VersionService } from './services/version.service.js';

// Main function with default dependencies
export async function main(
  env = process.env,
  fsApi = fs,
  shellUtil = new ShellUtil(),
) {
  const versionService = VersionService.create(shellUtil, fsApi);
  return await versionService.run(env);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await main();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
