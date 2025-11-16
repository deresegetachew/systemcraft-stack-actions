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

  const npmToken =
    env.NODE_AUTH_TOKEN || getActionInput('NODE_AUTH_TOKEN', env);

  if (npmToken) {
    updatedEnv.NODE_AUTH_TOKEN = npmToken;
    process.env.NODE_AUTH_TOKEN = npmToken;
  } else {
    throw new Error('❌ Missing npm token. Provide "NODE_AUTH_TOKEN" input.');
  }

  const githubToken = env.GITHUB_TOKEN || getActionInput('GITHUB_TOKEN', env);

  if (githubToken) {
    updatedEnv.GITHUB_TOKEN = githubToken;
    process.env.GITHUB_TOKEN = githubToken;
  } else {
    console.warn('⚠️ No GitHub token provided. Git operations may fail.');
  }

  if (typeof env.ENABLE_MULTI_RELEASE !== 'undefined') {
    const normalized =
      String(env.ENABLE_MULTI_RELEASE).toLowerCase() === 'true'
        ? 'true'
        : 'false';
    updatedEnv.ENABLE_MULTI_RELEASE = normalized;
  } else {
    const enableMultiRelease = getBooleanActionInput(
      'ENABLE_MULTI_RELEASE',
      env,
    );
    if (typeof enableMultiRelease === 'boolean') {
      updatedEnv.ENABLE_MULTI_RELEASE = enableMultiRelease ? 'true' : 'false';
    }
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
