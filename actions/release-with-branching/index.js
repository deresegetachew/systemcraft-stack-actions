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

  const npmToken = getActionInput('node_auth_token', env);

  if (!npmToken) {
    throw new Error('❌ Missing node_auth_token input.');
  }
  updatedEnv.node_auth_token = npmToken;
  process.env.node_auth_token = npmToken;

  const githubToken = getActionInput('github_token', env);

  if (!githubToken) {
    throw new Error('❌ Missing github_token input.');
  }
  updatedEnv.github_token = githubToken;
  process.env.github_token = githubToken;

  const enableMultiRelease = getBooleanActionInput('enable_multi_release', env);
  if (typeof enableMultiRelease === 'boolean') {
    updatedEnv.enable_multi_release = enableMultiRelease ? 'true' : 'false';
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
