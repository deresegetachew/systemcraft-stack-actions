#!/usr/bin/env node

// Import GitHub Actions modules for proper action execution
import core from '@actions/core';
import github from '@actions/github';

import { getActionInput } from '../../libs/utils/index.js';

import { ChangesetRequirementService } from './services/changeset-requirement.service.js';

async function main() {
  try {
    const skipLabel = getActionInput('skip-label') || '[skip changeset check]';
    const context = github.context;

    console.debug(`Event type: ${context.eventName}`);
    console.debug(`PR title: ${context.payload.pull_request?.title || 'N/A'}`);
    console.debug(`Actor: ${context.actor}`);

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
      console.debug(`ℹ️ ${result.skipReason}`);
      core.setOutput('skipped', 'true');
      return;
    }

    if (!result.hasChangeset) {
      const errorMessage = service.generateErrorMessage();
      console.debug(errorMessage);
      core.setFailed('No changeset found for this PR');
      return;
    }

    console.debug('');
    console.debug('✅ Changeset found:');
    console.debug(result.changesetFiles.join('\n'));
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
