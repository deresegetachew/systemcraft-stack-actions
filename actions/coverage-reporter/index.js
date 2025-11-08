import * as core from '@actions/core';

import { CoverageReporterService } from './services/coverage-reporter.service.js';

export async function main() {
  try {
    const inputs = {
      coverageCommand: core.getInput('coverage-command'),
      coverageFormat: core.getInput('coverage-format'),
      outputDir: core.getInput('output-dir'),
      enablePrComments: core.getBooleanInput('enable-pr-comments'),
      minimumCoverage: parseFloat(core.getInput('minimum-coverage')),
      githubToken: core.getInput('github-token'),
    };

    const service = new CoverageReporterService();
    const result = await service.run(inputs);

    // Set outputs
    core.setOutput('coverage-percentage', result.coveragePercentage);
    core.setOutput('coverage-status', result.status);
    core.setOutput('artifacts-path', result.artifactsPath);

    if (result.status === 'fail') {
      core.setFailed(
        `Coverage ${result.coveragePercentage}% is below minimum threshold ${inputs.minimumCoverage}%`,
      );
    }
  } catch (error) {
    core.setFailed(`Coverage reporter failed: ${error.message}`);
  }
}

// Only run if this file is executed directly
if (process.env.NODE_ENV !== 'test') {
  main();
}
