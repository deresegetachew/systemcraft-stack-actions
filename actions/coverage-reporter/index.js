import * as core from '@actions/core';

import {
  getActionInput,
  getBooleanActionInput,
} from '../../libs/utils/index.js';

import { CoverageReporterService } from './services/coverage-reporter.service.js';

const DEFAULTS = {
  coverageCommand: 'pnpm test -- --coverage',
  coverageFile: 'coverage/coverage-summary.json',
  coverageFormat: 'lcov',
  outputDir: 'coverage-artifacts',
  enablePrComments: true,
  minimumCoverage: 80,
  enableDiff: true,
  baselineArtifactName: 'coverage-baseline-main',
  baseBranch: 'main',
};

export async function main() {
  try {
    console.log(`env variables`, { envVars: process.env });
    console.log(`githubToken : ${getActionInput('github-token')}`);

    const inputs = {
      coverageCommand:
        getActionInput('coverage-command') || DEFAULTS.coverageCommand,
      coverageFile: getActionInput('coverage-file') || DEFAULTS.coverageFile,
      coverageFormat:
        getActionInput('coverage-format') || DEFAULTS.coverageFormat,
      outputDir: getActionInput('output-dir') || DEFAULTS.outputDir,
      enablePrComments:
        getBooleanActionInput('enable-pr-comments') ??
        DEFAULTS.enablePrComments,
      minimumCoverage: (() => {
        const input = getActionInput('minimum-coverage');
        if (!input) return DEFAULTS.minimumCoverage;
        const parsed = Number(input);
        return Number.isNaN(parsed) ? DEFAULTS.minimumCoverage : parsed;
      })(),
      githubToken: getActionInput('github-token'),
      enableDiff: getBooleanActionInput('enable-diff') ?? DEFAULTS.enableDiff,
      baselineArtifactName:
        getActionInput('baseline-artifact-name') ||
        DEFAULTS.baselineArtifactName,
      baseBranch: getActionInput('base-branch') || DEFAULTS.baseBranch,
    };

    const service = new CoverageReporterService();
    const result = await service.run(inputs);

    // Set outputs
    core.setOutput('coverage-percentage', result.coveragePercentage);
    core.setOutput('coverage-status', result.status);
    core.setOutput('artifacts-path', result.artifactsPath);

    // if (result.status === 'fail') {
    //   core.setFailed(
    //     `Coverage ${result.coveragePercentage}% is below minimum threshold ${inputs.minimumCoverage}%`,
    //   );
    // }
  } catch (error) {
    core.setFailed(`Coverage reporter failed: ${error.message}`);
  }
}

// Only run if this file is executed directly
if (process.env.NODE_ENV !== 'test') {
  main();
}
