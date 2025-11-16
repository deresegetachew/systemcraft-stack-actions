#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import {
  ShellUtil,
  getActionInput,
  getBooleanActionInput,
} from '../../libs/utils/index.js';

import { ReleaseService } from './services/release.service.js';

export function configureAuthEnv(env = {}) {
  const updatedEnv = { ...env };

  const npmToken = getActionInput('node-auth-token', env);

  if (!npmToken) {
    throw new Error('❌ Missing node-auth-token input.');
  }
  updatedEnv.NODE_AUTH_TOKEN = npmToken;
  process.env.NODE_AUTH_TOKEN = npmToken;

  const githubToken = getActionInput('github-token', env);

  if (!githubToken) {
    throw new Error('❌ Missing github-token input.');
  }
  updatedEnv.GITHUB_TOKEN = githubToken;
  process.env.GITHUB_TOKEN = githubToken;

  const enableMultiRelease = getBooleanActionInput('enable-multi-release', env);
  if (typeof enableMultiRelease === 'boolean') {
    updatedEnv.ENABLE_MULTI_RELEASE = enableMultiRelease ? 'true' : 'false';
  }

  return updatedEnv;
}

// Main function with default dependencies
export async function main(
  env = process.env,
  fsApi = fs,
  shellUtil = new ShellUtil(),
  pathApi = path,
) {
  const runtimeEnv = configureAuthEnv(env);
  const releaseService = ReleaseService.create(shellUtil, fsApi, pathApi);
  return await releaseService.run(runtimeEnv);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await main();
  } catch (err) {
    // If the error is about skipping, it's not a failure.
    if (err.message.includes('Skipping release process')) {
      console.debug(`✅ ${err.message}`);
      process.exit(0);
    } else {
      console.error(err.message);
      process.exit(1);
    }
  }
}
