#!/usr/bin/env node

import fs from 'node:fs';

import { ShellUtil } from '../../libs/utils/index.js';

import { ReleaseService } from './services/release.service.js';

// Main function with default dependencies
export async function main(env = process.env, fsApi = fs, shellUtil = new ShellUtil()) {
  const releaseService = ReleaseService.create(shellUtil, fsApi);
  return await releaseService.run(env);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await main();
  } catch (err) {
    // If the error is about skipping, it's not a failure.
    if (err.message.includes('Skipping release process')) {
      console.log(`✅ ${err.message}`);
      process.exit(0);
    } else {
      console.error(err.message);
      process.exit(1);
    }
  }
}