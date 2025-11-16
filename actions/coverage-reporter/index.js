import * as core from '@actions/core';

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

function getInputOrDefault(name, fallback) {
  const value = core.getInput(name);
  return value ? value : fallback;
}

function getBooleanInputOrDefault(name, fallback) {
  const value = core.getInput(name);
  if (!value) {
    return fallback;
  }

  return value.toLowerCase() === 'true';
}

function getNumberInputOrDefault(name, fallback) {
  const value = core.getInput(name);
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export async function main() {
  try {
    const inputs = {
      coverageCommand: getInputOrDefault(
        'coverage-command',
        DEFAULTS.coverageCommand,
      ),
      coverageFile: getInputOrDefault('coverage-file', DEFAULTS.coverageFile),
      coverageFormat: getInputOrDefault(
        'coverage-format',
        DEFAULTS.coverageFormat,
      ),
      outputDir: getInputOrDefault('output-dir', DEFAULTS.outputDir),
      enablePrComments: getBooleanInputOrDefault(
        'enable-pr-comments',
        DEFAULTS.enablePrComments,
      ),
      minimumCoverage: getNumberInputOrDefault(
        'minimum-coverage',
        DEFAULTS.minimumCoverage,
      ),
      githubToken: getInputOrDefault(
        'github-token',
        process.env.GITHUB_TOKEN || '',
      ),
      enableDiff: getBooleanInputOrDefault('enable-diff', DEFAULTS.enableDiff),
      baselineArtifactName: getInputOrDefault(
        'baseline-artifact-name',
        DEFAULTS.baselineArtifactName,
      ),
      baseBranch: getInputOrDefault('base-branch', DEFAULTS.baseBranch),
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
