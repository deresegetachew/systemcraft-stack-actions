#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import { ShellUtil } from '../../libs/utils/index.js';

import { ReleaseService } from './services/release.service.js';

export function configureAuthEnv(env = {}) {
  const updatedEnv = { ...env };

  const npmToken = updatedEnv.INPUT_NPM_TOKEN;

  if (npmToken) {
    updatedEnv.NODE_AUTH_TOKEN = npmToken;
    process.env.NODE_AUTH_TOKEN = npmToken;
  } else {
    throw new Error('❌ Missing npm token. Provide "npm-token" input.');
  }

  const githubToken = updatedEnv.INPUT_GITHUB_TOKEN;

  if (githubToken) {
    process.env.GITHUB_TOKEN = githubToken;
  } else {
    console.warn('⚠️ No GitHub token provided. Git operations may fail.');
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
