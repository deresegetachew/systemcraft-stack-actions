#!/usr/bin/env node

import core from '@actions/core';
import github from '@actions/github';

import { ChangesetRequirementService } from './services/changeset-requirement.service.js';

async function main() {
  try {
    const skipLabel =
      core.getInput('skip-label') ||
      process.env['INPUT_SKIP-LABEL'] ||
      '[skip changeset check]';
    const context = github.context;

    console.log(`Event type: ${context.eventName}`);
    console.log(`PR title: ${context.payload.pull_request?.title || 'N/A'}`);
    console.log(`Actor: ${context.actor}`);

    // Use service for validation
    const service = new ChangesetRequirementService();
    const result = await service.validateChangeset(context, { skipLabel });

    // Handle service result
    if (result.error) {
      console.error('❌ Validation error:', result.error);
      core.setFailed(result.error);
      return;
    }

    if (result.shouldSkip) {
      console.log(`ℹ️ ${result.skipReason}`);
      core.setOutput('skipped', 'true');
      return;
    }

    if (!result.hasChangeset) {
      const errorMessage = service.generateErrorMessage();
      console.log(errorMessage);
      core.setFailed('No changeset found for this PR');
      return;
    }

    console.log('');
    console.log('✅ Changeset found:');
    console.log(result.changesetFiles.join('\n'));
    core.setOutput('changeset-files', result.changesetFiles.join(','));
  } catch (error) {
    console.error('❌ Action failed:', error.message);
    core.setFailed(error.message);
  }
}

// Export service and main function for testing
export { ChangesetRequirementService, main };

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
