import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import { ShellUtil, GitUtil } from '@systemcraft-stack-actions/utils';

class EnvContext {
  constructor(env = process.env) {
    this.set(env);
  }

  set(env) {
    this.serverUrl = env.GITHUB_SERVER_URL || 'https://github.com';
    this.repo = env.GITHUB_REPOSITORY || '';
    this.runId = env.GITHUB_RUN_ID || '';
    this.ref = env.GITHUB_REF || '';
    this.eventPath = env.GITHUB_EVENT_PATH || '';
    this.apiUrl = env.GITHUB_API_URL || 'https://api.github.com';
    this.token = env.GITHUB_TOKEN || '';
  }

  refresh() {
    this.set(process.env);
  }

  getArtifactsUrl() {
    if (!this.repo || !this.runId) {
      return null;
    }
    return `${this.serverUrl}/${this.repo}/actions/runs/${this.runId}`;
  }
}

export class CoverageReporterService {
  constructor(shellUtil, fsApi, gitUtil) {
    this.shell = shellUtil || new ShellUtil();
    this.fs = fsApi || fs;
    this.git = gitUtil || new GitUtil(this.shell); // Initialize with no token, will be set in run method
    this.tempDir = path.join(os.tmpdir(), 'coverage-baseline');
    this.env = new EnvContext();
  }

  static create() {
    return new CoverageReporterService();
  }

  async run(inputs) {
    console.debug('🚀 Starting coverage reporting...');

    const normalizedInputs = this.normalizeInputs(inputs);

    console.debug('Normalized inputs', normalizedInputs);

    this.ensureDirectory(normalizedInputs.outputDir);

    // Ensure Git client always has the latest token (from inputs or env)
    this.git.githubToken =
      normalizedInputs.githubToken ||
      process.env.GITHUB_TOKEN ||
      this.git.githubToken;

    const baselineCoverage = await this.getBaselineCoverage(normalizedInputs);
    const currentCoverage = this.getCurrentCoverage(normalizedInputs);

    console.debug(
      `Baseline data:, ${JSON.stringify(baselineCoverage, null, 2)}`,
    );
    console.debug(`Current data: ${JSON.stringify(currentCoverage, null, 2)}`);

    const summary = this.createSummary(
      currentCoverage,
      baselineCoverage,
      normalizedInputs.minimumCoverage,
    );

    const persisted = await this.persistSummaryFiles(
      summary,
      currentCoverage,
      normalizedInputs,
    );
    this.copyHtmlReports(normalizedInputs.outputDir);
    if (normalizedInputs.enablePrComments && persisted?.markdownReport) {
      await this.git.upsertPrComment({
        body: persisted.markdownReport,
      });
    }
    this.logFinalStats(summary, baselineCoverage);

    return {
      coveragePercentage: this.getMinimumMetric(
        summary.coverage || summary.details,
      ).toFixed(2),
      status: summary.status,
      artifactsPath: normalizedInputs.outputDir,
      summary,
      baselineCoverage,
    };
  }

  ensureDirectory(dirPath) {
    if (!this.fs.existsSync(dirPath)) {
      this.fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  normalizeInputs(inputs = {}) {
    return {
      ...inputs,
      outputDir: inputs.outputDir || 'coverage-artifacts',
      coverageFile: inputs.coverageFile || 'coverage/coverage-summary.json',
      coverageCommand: inputs.coverageCommand || 'pnpm test -- --coverage',
      enableDiff: Boolean(inputs.enableDiff),
      enablePrComments: Boolean(inputs.enablePrComments),
      minimumCoverage: Number(inputs.minimumCoverage ?? 0),
      baselineArtifactName:
        inputs.baselineArtifactName || 'coverage-baseline-main',
      baseBranch: inputs.baseBranch || 'main',
      githubToken: inputs.githubToken ?? process.env.GITHUB_TOKEN ?? '',
    };
  }

  shouldLoadCoverageFromFile(filePath) {
    return Boolean(filePath && this.fs.existsSync(filePath));
  }

  readCoverageFromFile(filePath) {
    const summary = JSON.parse(this.fs.readFileSync(filePath, 'utf8'));
    return this.parseCoverageFromSummary(summary);
  }

  createSummary(coverage, baselineCoverage, minimumCoverage) {
    // Handle both single coverage and per-package coverage
    if (coverage.type === 'packages') {
      const normalizedCoverage =
        this.normalizePackagesCoverage(coverage) || coverage;
      const normalizedBaseline =
        baselineCoverage?.type === 'packages'
          ? this.normalizePackagesCoverage(baselineCoverage)
          : null;
      return this.createPackageComparisonSummary(
        normalizedCoverage,
        normalizedBaseline,
        minimumCoverage,
      );
    }

    return {
      coverage,
      diff: baselineCoverage
        ? this.calculateCoverageDiff(coverage, baselineCoverage)
        : null,
      details: coverage,
      baseline: baselineCoverage,
      timestamp: new Date().toISOString(),
      minimumCoverage,
      status: this.isPassingCoverage(coverage, minimumCoverage)
        ? 'pass'
        : 'fail',
    };
  }

  createPackageComparisonSummary(
    currentCoverage,
    baselineCoverage,
    minimumCoverage,
  ) {
    const currentPackages = currentCoverage?.packages || [];
    const packageComparisons = [];
    let totalCoverage = { statements: 0, branches: 0, functions: 0, lines: 0 };
    let totalBaselineCoverage = {
      statements: 0,
      branches: 0,
      functions: 0,
      lines: 0,
    };
    let totalDiff = { statements: 0, branches: 0, functions: 0, lines: 0 };
    let totalPackages = 0;
    let packagesWithBaseline = 0;

    // Parse baseline coverage into a map for easy lookup
    const baselineMap = new Map();
    if (baselineCoverage?.type === 'packages') {
      for (const pkg of baselineCoverage.packages) {
        baselineMap.set(pkg.package, pkg.coverage);
      }
    }

    // Process each current package
    for (const pkg of currentPackages) {
      const { package: pkgName, coverage: pkgCoverage } = pkg;
      if (!pkgName || !pkgCoverage) {
        continue;
      }

      try {
        const baselinePkgCoverage = baselineMap.get(pkgName) || null;
        const diff = baselinePkgCoverage
          ? this.calculateCoverageDiff(pkgCoverage, baselinePkgCoverage)
          : null;

        packageComparisons.push({
          package: pkgName,
          coverage: pkgCoverage,
          baseline: baselinePkgCoverage,
          diff,
          status: this.isPassingCoverage(pkgCoverage, minimumCoverage)
            ? 'pass'
            : 'fail',
        });

        // Add to total for overall calculation
        totalCoverage.statements += pkgCoverage.statements;
        totalCoverage.branches += pkgCoverage.branches;
        totalCoverage.functions += pkgCoverage.functions;
        totalCoverage.lines += pkgCoverage.lines;
        totalPackages++;

        if (baselinePkgCoverage) {
          totalBaselineCoverage.statements += baselinePkgCoverage.statements;
          totalBaselineCoverage.branches += baselinePkgCoverage.branches;
          totalBaselineCoverage.functions += baselinePkgCoverage.functions;
          totalBaselineCoverage.lines += baselinePkgCoverage.lines;
          totalDiff.statements += diff.statements;
          totalDiff.branches += diff.branches;
          totalDiff.functions += diff.functions;
          totalDiff.lines += diff.lines;
          packagesWithBaseline++;
        }
      } catch (error) {
        console.warn(
          `⚠️ Failed to parse current coverage for ${pkgName}: ${error.message}`,
        );
      }
    }

    // Calculate overall averages
    const overallCoverage =
      totalPackages > 0
        ? {
            statements: totalCoverage.statements / totalPackages,
            branches: totalCoverage.branches / totalPackages,
            functions: totalCoverage.functions / totalPackages,
            lines: totalCoverage.lines / totalPackages,
          }
        : { statements: 0, branches: 0, functions: 0, lines: 0 };

    const overallBaselineCoverage =
      packagesWithBaseline > 0
        ? {
            statements: totalBaselineCoverage.statements / packagesWithBaseline,
            branches: totalBaselineCoverage.branches / packagesWithBaseline,
            functions: totalBaselineCoverage.functions / packagesWithBaseline,
            lines: totalBaselineCoverage.lines / packagesWithBaseline,
          }
        : null;

    const overallDiff =
      packagesWithBaseline > 0
        ? {
            statements: totalDiff.statements / packagesWithBaseline,
            branches: totalDiff.branches / packagesWithBaseline,
            functions: totalDiff.functions / packagesWithBaseline,
            lines: totalDiff.lines / packagesWithBaseline,
          }
        : null;

    return {
      type: 'packages',
      baseline: overallBaselineCoverage,
      diff: overallDiff,
      coverage: overallCoverage,
      packages: packageComparisons,
      timestamp: new Date().toISOString(),
      minimumCoverage,
      status: packageComparisons.every((pkg) => pkg.status === 'pass')
        ? 'pass'
        : 'fail',
    };
  }

  normalizePackagesCoverage(coverage) {
    if (!coverage || coverage.type !== 'packages') {
      return null;
    }

    if (Array.isArray(coverage.packages)) {
      return coverage;
    }

    if (Array.isArray(coverage.files)) {
      return this.buildPackagesCoverageDetail(coverage);
    }

    return null;
  }

  async persistSummaryFiles(summary, coverage, inputs) {
    const summaryFileName = path.basename(inputs.coverageFile);
    const summaryPath = path.join(inputs.outputDir, summaryFileName);
    this.fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

    if (!inputs.enablePrComments) {
      return { summaryPath, reportPath: null, markdownReport: null };
    }

    const markdownReport = this.generateMarkdownReport(
      summary.type === 'packages' ? summary : coverage,
      inputs.minimumCoverage,
      summary.baseline,
      this.getArtifactsUrl(),
    );
    const reportPath = path.join(inputs.outputDir, 'coverage-report.md');
    this.fs.writeFileSync(reportPath, markdownReport);
    console.debug(`✅ Coverage report saved to ${reportPath}`);

    return { summaryPath, reportPath, markdownReport };
  }

  copyHtmlReports(outputDir) {
    if (!this.fs.existsSync('coverage')) {
      return;
    }

    console.debug('📋 Copying HTML coverage reports...');
    this.shell.exec(`cp -r coverage ${path.join(outputDir, 'html-report')}`);
  }

  logFinalStats(summary, baselineCoverage) {
    console.debug('🎉 Coverage reporting completed!');
    const metricKeys = ['statements', 'branches', 'functions', 'lines'];
    const formatCoverageLine = (label, data) =>
      `${label}: ${metricKeys
        .map((m) => `${m[0].toUpperCase()}: ${data[m].toFixed(2)}%`)
        .join(' | ')}`;

    if (summary.type === 'packages') {
      console.debug(`📦 Package breakdown:`);
      for (const pkg of summary.packages) {
        if (pkg.baseline) {
          const diff = this.calculateCoverageDiff(pkg.coverage, pkg.baseline);
          console.debug(
            `  📋 ${pkg.package}: ${formatCoverageLine('current', pkg.coverage)} | Δ ${formatCoverageLine(
              'diff',
              diff,
            )}`,
          );
        } else {
          console.debug(
            `  📋 ${pkg.package}: ${formatCoverageLine('current', pkg.coverage)}`,
          );
        }
      }
      return;
    }

    const current = summary.coverage || summary.details;

    console.debug(
      `📊 Current coverage: ${formatCoverageLine('current', current)}`,
    );

    if (!baselineCoverage) {
      return;
    }

    const diff = this.calculateCoverageDiff(current, baselineCoverage);
    console.debug(
      `📈 Coverage change by metric: ${formatCoverageLine('diff', diff)}`,
    );
  }

  runCoverage(coverageCommand) {
    console.debug(`🧪 Running coverage command: ${coverageCommand}`);
    try {
      const result = this.shell.exec(coverageCommand, { stdio: 'pipe' });
      return { success: true, output: result.stdout };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  parseCoverageFromOutput(output) {
    // Parse coverage from c8 or jest output
    const lines = output.split('\n');

    // Look for c8 summary line
    const summaryLine = lines.find((line) => line.includes('All files'));

    if (summaryLine) {
      // Extract percentages from c8 output
      const percentageMatches = summaryLine.match(/(\d+\.?\d*)/g);
      if (percentageMatches && percentageMatches.length >= 4) {
        return {
          statements: parseFloat(percentageMatches[0]),
          branches: parseFloat(percentageMatches[1]),
          functions: parseFloat(percentageMatches[2]),
          lines: parseFloat(percentageMatches[3]),
        };
      }
    }

    // Fallback: look for common coverage patterns
    const coveragePattern = /(\d+\.?\d*)%/g;
    const matches = output.match(coveragePattern);
    if (matches && matches.length > 0) {
      const percentage = parseFloat(matches[0].replace('%', ''));
      return {
        statements: percentage,
        branches: percentage,
        functions: percentage,
        lines: percentage,
      };
    }

    return {
      statements: 0,
      branches: 0,
      functions: 0,
      lines: 0,
    };
  }

  parseCoverageFromSummary(summary) {
    console.debug(`parsing summary coverage ${JSON.stringify({ summary })}`);
    const totals = summary?.total ?? summary ?? {};
    const normalize = (metric) => {
      const raw = totals?.[metric];
      const pct = raw?.pct ?? raw;
      const asNumber =
        typeof pct === 'number'
          ? pct
          : Number.isFinite(Number(pct))
            ? Number(pct)
            : NaN;
      return Number.isFinite(asNumber) ? asNumber : 0;
    };
    return {
      statements: normalize('statements'),
      branches: normalize('branches'),
      functions: normalize('functions'),
      lines: normalize('lines'),
    };
  }

  desanitizePackageName(name) {
    if (!name || typeof name !== 'string') return name;
    let result = name;
    if (result.startsWith('at-')) {
      result = `@${result.slice(3)}`;
    }
    return result.replaceAll('__', '/');
  }

  aggregateCoverageFromPackages(packages = []) {
    if (!Array.isArray(packages) || packages.length === 0) {
      return { statements: 0, branches: 0, functions: 0, lines: 0 };
    }
    const totals = packages.reduce(
      (acc, pkg) => {
        acc.statements += pkg.coverage?.statements || 0;
        acc.branches += pkg.coverage?.branches || 0;
        acc.functions += pkg.coverage?.functions || 0;
        acc.lines += pkg.coverage?.lines || 0;
        return acc;
      },
      { statements: 0, branches: 0, functions: 0, lines: 0 },
    );
    return {
      statements: totals.statements / packages.length,
      branches: totals.branches / packages.length,
      functions: totals.functions / packages.length,
      lines: totals.lines / packages.length,
    };
  }

  calculateCoverageDiff(current, baseline) {
    return {
      statements: (current?.statements || 0) - (baseline?.statements || 0),
      branches: (current?.branches || 0) - (baseline?.branches || 0),
      functions: (current?.functions || 0) - (baseline?.functions || 0),
      lines: (current?.lines || 0) - (baseline?.lines || 0),
    };
  }

  isPassingCoverage(coverage, minimum) {
    const metrics = ['statements', 'branches', 'functions', 'lines'];
    return metrics.every((metric) => (coverage?.[metric] ?? 0) >= minimum);
  }

  getMinimumMetric(coverage) {
    const metrics = ['statements', 'branches', 'functions', 'lines'];
    const result = metrics.reduce(
      (min, key) => Math.min(min, Number(coverage?.[key] ?? 0)),
      Infinity,
    );
    return Number.isFinite(result) ? result : 0;
  }

  generateMarkdownReport(
    coverage,
    minimumCoverage,
    baselineCoverage = null,
    artifactsUrl = null,
  ) {
    // Handle per-package coverage reports
    if (coverage.type === 'packages') {
      return this.generatePackageMarkdownReport(
        coverage,
        minimumCoverage,
        baselineCoverage,
        artifactsUrl,
      );
    }

    if (!coverage.type && baselineCoverage?.type === 'packages') {
      const aggregateBaseline = this.aggregateCoverageFromPackages(
        baselineCoverage.packages,
      );
      const syntheticPackages = baselineCoverage.packages.map((pkg) => ({
        package: pkg.package,
        coverage,
        baseline: pkg.coverage,
        diff: this.calculateCoverageDiff(coverage, pkg.coverage),
        status: this.isPassingCoverage(coverage, minimumCoverage)
          ? 'pass'
          : 'fail',
      }));

      return this.generatePackageMarkdownReport(
        {
          type: 'packages',
          packages: syntheticPackages,
          coverage,
          baseline: aggregateBaseline,
        },
        minimumCoverage,
        aggregateBaseline,
      );
    }

    const normalizedBaseline =
      baselineCoverage?.type === 'packages'
        ? this.aggregateCoverageFromPackages(baselineCoverage.packages)
        : baselineCoverage;

    const getStatus = (percentage) =>
      percentage >= minimumCoverage ? '✅ Pass' : '❌ Fail';

    const getDiffIcon = (current, baseline) => {
      if (baseline === null || baseline === undefined) return '';
      const diff = current - baseline;
      if (Math.abs(diff) < 0.01) return ' ➡️'; // No change
      return diff > 0 ? ' ⬆️' : ' ⬇️';
    };

    const formatDiff = (current, baseline) => {
      if (baseline === null || baseline === undefined) return '';
      const diff = current - baseline;
      const sign = diff > 0 ? '+' : '';
      return ` (${sign}${diff.toFixed(2)}%)`;
    };

    let report = `## 📊 Coverage Report\n\n`;

    report += `| Metric | Current | ${baselineCoverage ? 'Baseline | Change |' : ''} Status |\n`;
    report += `|--------|---------|${baselineCoverage ? '---------|--------|' : ''}--------|\n`;

    const metrics = [
      { key: 'statements', label: 'Statements' },
      { key: 'branches', label: 'Branches' },
      { key: 'functions', label: 'Functions' },
      { key: 'lines', label: 'Lines' },
    ];

    for (const metric of metrics) {
      const current = coverage[metric.key];
      const baseline = normalizedBaseline?.[metric.key];
      const diff = getDiffIcon(current, baseline);
      const change = formatDiff(current, baseline);

      if (normalizedBaseline) {
        report += `| **${metric.label}** | ${current.toFixed(2)}% | ${baseline?.toFixed(2) || 'N/A'}% | ${change}${diff} | ${getStatus(current)} |\n`;
      } else {
        report += `| **${metric.label}** | ${current.toFixed(2)}% | ${getStatus(current)} |\n`;
      }
    }

    report += '\n';

    if (!this.isPassingCoverage(coverage, minimumCoverage)) {
      report += `⚠️ **Coverage is below minimum threshold of ${minimumCoverage}%**\n\n`;
    }

    if (baselineCoverage) {
      report += `📊 *Comparison with baseline from previous successful run*\n\n`;
    }

    if (artifactsUrl) {
      report += `📂 [Download coverage artifacts](${artifactsUrl})\n\n`;
    }

    report += `---\n`;
    report += `*Report generated by [Coverage Reporter](https://github.com/deresegetachew/systemcraft-stack-actions/tree/main/actions/coverage-reporter)*`;

    return report;
  }

  generatePackageMarkdownReport(
    summary,
    minimumCoverage,
    baselineCoverage = null,
    artifactsUrl = null,
  ) {
    const getStatus = (percentage) =>
      percentage >= minimumCoverage ? '✅ Pass' : '❌ Fail';

    const getDiffIcon = (current, baseline) => {
      if (baseline === null || baseline === undefined) return '';
      const diff = current - baseline;
      if (Math.abs(diff) < 0.01) return ' ➡️';
      return diff > 0 ? ' ⬆️' : ' ⬇️';
    };

    const formatDiff = (current, baseline) => {
      if (baseline === null || baseline === undefined) return '';
      const diff = current - baseline;
      const sign = diff > 0 ? '+' : '';
      return ` (${sign}${diff.toFixed(2)}%)`;
    };

    let report = `## 📊 Coverage Report by Package\n\n`;

    // Package-by-package breakdown
    for (const pkg of summary.packages) {
      const { package: pkgName, coverage, baseline } = pkg;

      report += `#### 📦 ${pkgName}\n`;
      report += `| Metric | Current | ${baseline ? 'Baseline | Change |' : ''} Status |\n`;
      report += `|--------|---------|${baseline ? '---------|--------|' : ''}--------|\n`;

      const metrics = [
        { key: 'statements', label: 'Statements' },
        { key: 'branches', label: 'Branches' },
        { key: 'functions', label: 'Functions' },
        { key: 'lines', label: 'Lines' },
      ];

      for (const metric of metrics) {
        const current = coverage[metric.key];
        const baselineValue = baseline?.[metric.key];
        const diff = getDiffIcon(current, baselineValue);
        const change = formatDiff(current, baselineValue);

        if (baseline) {
          const baselineDisplay = baselineValue?.toFixed(2) || 'N/A';
          const baselineCell =
            artifactsUrl &&
            baselineValue !== undefined &&
            baselineValue !== null
              ? `[${baselineDisplay}%](${artifactsUrl})`
              : `${baselineDisplay}%`;
          report += `| **${metric.label}** | ${current.toFixed(2)}% | ${baselineCell} | ${change}${diff} | ${getStatus(current)} |\n`;
        } else {
          report += `| **${metric.label}** | ${current.toFixed(2)}% | ${getStatus(current)} |\n`;
        }
      }

      report += '\n';
    }

    if (!summary.packages.every((pkg) => pkg.status === 'pass')) {
      report += `⚠️ **Some packages are below the minimum threshold of ${minimumCoverage}%**\n\n`;
    }

    const failedPackages = summary.packages.filter(
      (pkg) => pkg.status === 'fail',
    );
    if (failedPackages.length > 0) {
      report += `❌ **Packages below threshold:** ${failedPackages.map((pkg) => pkg.package).join(', ')}\n\n`;
    }

    if (baselineCoverage) {
      report += `📊 *Comparison with baseline from previous successful run*\n\n`;
    }

    if (artifactsUrl) {
      report += `📂 [Download coverage artifacts](${artifactsUrl})\n\n`;
    }

    report += `---\n`;
    report += `*Report generated by [Coverage Reporter](https://github.com/deresegetachew/systemcraft-stack-actions/tree/main/actions/coverage-reporter)*`;

    return report;
  }

  getCurrentCoverage(inputs) {
    let coverageData = this.loadCurrentCoverage(
      inputs.outputDir,
      inputs.coverageFile,
    );

    if (coverageData) {
      console.debug('✅ Using coverage data from artifacts directory');
    } else if (this.shouldLoadCoverageFromFile(inputs.coverageFile)) {
      console.debug(`📄 Loading coverage from file: ${inputs.coverageFile}`);
      coverageData = this.readCoverageFromFile(inputs.coverageFile);
    } else {
      if (!inputs.coverageCommand) {
        throw new Error(
          'Coverage command not provided and no coverage artifacts found',
        );
      }
      console.debug(
        '🧪 No existing coverage found, running coverage command...',
      );
      const coverageResult = this.runCoverage(inputs.coverageCommand);
      if (!coverageResult.success) {
        throw new Error(`Coverage command failed: ${coverageResult.error}`);
      }

      // After running command, try to load again
      const generatedCoverage = this.loadCurrentCoverage(
        inputs.outputDir,
        inputs.coverageFile,
      );
      if (generatedCoverage) {
        coverageData = generatedCoverage;
        console.debug(
          '✅ Using coverage data generated in artifacts directory',
        );
      } else if (this.shouldLoadCoverageFromFile(inputs.coverageFile)) {
        console.debug(
          `📄 Loading coverage from generated file: ${inputs.coverageFile}`,
        );
        coverageData = this.readCoverageFromFile(inputs.coverageFile);
      } else {
        console.debug('📄 Parsing coverage from command output...');
        coverageData = this.parseCoverageFromOutput(coverageResult.output);
      }
    }

    if (coverageData && coverageData.type === 'packages') {
      console.debug('📦 Aggregating package coverage...');
      return this.buildPackagesCoverageDetail(coverageData);
    }

    return coverageData;
  }

  loadCurrentCoverage(outputDir, coverageFile) {
    try {
      // Look for package-specific coverage files in the current artifacts
      const packagesWithCoverage = [];

      if (this.fs.existsSync(outputDir)) {
        const dirContents = this.fs.readdirSync(outputDir);

        for (const item of dirContents) {
          const itemPath = path.join(outputDir, item);
          if (this.fs.statSync(itemPath).isDirectory()) {
            // Use the specified coverage file name (e.g., coverage-summary.json)
            const coverageFileName = path.basename(coverageFile);
            const coverageJsonPath = path.join(itemPath, coverageFileName);

            if (this.fs.existsSync(coverageJsonPath)) {
              packagesWithCoverage.push({
                package: item,
                path: coverageJsonPath,
              });
            }
          }
        }
      }

      if (packagesWithCoverage.length > 0) {
        console.debug(
          `📦 Found ${packagesWithCoverage.length} current coverage packages`,
        );
        return { type: 'packages', files: packagesWithCoverage };
      }

      // Fallback: search monorepo packages/* for coverage files
      const packagesDir = 'packages';
      if (this.fs.existsSync(packagesDir)) {
        const packageDirs = this.fs
          .readdirSync(packagesDir)
          .filter((dir) =>
            this.fs.statSync(path.join(packagesDir, dir)).isDirectory(),
          );

        for (const dir of packageDirs) {
          const candidatePaths = [
            path.join(packagesDir, dir, coverageFile),
            path.join(packagesDir, dir, 'coverage', coverageFile),
          ];

          for (const coveragePath of candidatePaths) {
            if (!this.fs.existsSync(coveragePath)) continue;

            let pkgName = dir;
            const pkgJsonPath = path.join(packagesDir, dir, 'package.json');
            if (this.fs.existsSync(pkgJsonPath)) {
              try {
                const pkgJson = JSON.parse(
                  this.fs.readFileSync(pkgJsonPath, 'utf8'),
                );
                pkgName = pkgJson.name || dir;
              } catch {
                pkgName = dir;
              }
            }
            packagesWithCoverage.push({
              package: pkgName,
              path: coveragePath,
            });
            break; // prefer first existing path
          }
        }

        if (packagesWithCoverage.length > 0) {
          console.debug(
            `📦 Found ${packagesWithCoverage.length} package coverages in packages/*`,
          );
          return { type: 'packages', files: packagesWithCoverage };
        }
      }

      // Fallback: try to read from coverage file in output directory
      const summaryPath = path.join(outputDir, path.basename(coverageFile));
      if (this.fs.existsSync(summaryPath)) {
        console.debug(
          `📊 Using ${path.basename(coverageFile)} from output directory`,
        );
        return this.readCoverageFromFile(summaryPath);
      }
    } catch (error) {
      console.warn('Failed to load current coverage:', error.message);
    }

    return null;
  }

  canDownloadBaseLine(inputs) {
    if (!inputs.enableDiff || !inputs.baselineArtifactName) {
      console.debug(
        '📊 Baseline comparison disabled or no artifact name provided',
      );
      return false;
    }

    if (!inputs.githubToken) {
      console.warn('⚠️ GitHub token not available, skipping baseline download');
      return false;
    }

    if (!process.env.GITHUB_REPOSITORY) {
      console.warn('⚠️ GITHUB_REPOSITORY not set, skipping baseline download');
      return false;
    }

    return true;
  }

  getBaselineZipPath() {
    return path.join(this.tempDir, 'baseline.zip');
  }

  getBaselineExtractPath() {
    return path.join(this.tempDir, 'extracted');
  }

  prepareBaselineWorkspace() {
    this.ensureDirectory(this.tempDir);
    const extractDir = this.getBaselineExtractPath();
    this.fs.rmSync(extractDir, { recursive: true, force: true });
    this.ensureDirectory(extractDir);
    return extractDir;
  }

  writeArtifactZip(artifactBuffer) {
    this.fs.writeFileSync(
      this.getBaselineZipPath(),
      Buffer.from(artifactBuffer),
    );
  }

  unpackBaselineZip(zipPath, extractDir) {
    try {
      this.shell.exec(`unzip -q -o "${zipPath}" -d "${extractDir}"`);
      return true;
    } catch (error) {
      console.warn(`⚠️ Failed to extract baseline artifact: ${error.message}`);
      return false;
    }
  }

  findBaselineCoverageFiles(
    extractDir,
    coverageFileName = 'coverage-summary.json',
  ) {
    const coverageFiles = [];

    // First, try standard coverage-summary.json locations
    const possibleSummaryPaths = [
      path.join(extractDir, coverageFileName),
      path.join(extractDir, 'coverage-artifacts', coverageFileName),
      path.join(extractDir, 'coverage', coverageFileName),
      path.join(extractDir, 'coverage-artifacts', 'coverage', coverageFileName),
      path.join(extractDir, 'dist', coverageFileName),
      path.join(extractDir, 'artifacts', coverageFileName),
    ];

    for (const summaryPath of possibleSummaryPaths) {
      if (this.fs.existsSync(summaryPath)) {
        console.debug(`✅ Found coverage summary at: ${summaryPath}`);
        return { type: 'summary', path: summaryPath };
      }
    }

    // If no summary found, look for package-specific coverage.json files
    try {
      const dirContents = this.fs.readdirSync(extractDir);

      for (const item of dirContents) {
        const itemPath = path.join(extractDir, item);
        if (this.fs.statSync(itemPath).isDirectory()) {
          const coverageJsonPath = path.join(itemPath, 'coverage.json');
          if (this.fs.existsSync(coverageJsonPath)) {
            coverageFiles.push({ package: item, path: coverageJsonPath });
          }
        }
      }

      if (coverageFiles.length > 0) {
        console.debug(
          `✅ Found ${coverageFiles.length} package-specific coverage files`,
        );
        return { type: 'packages', files: coverageFiles };
      }
    } catch (error) {
      console.warn('Failed to scan for coverage files:', error.message);
    }

    return null;
  }

  readBaselineCoverage(extractDir, coverageFileName = 'coverage-summary.json') {
    // Debug: show what's actually in the extracted directory
    console.debug('🔍 Debugging extracted artifact contents...');
    try {
      const dirContents = this.fs.readdirSync(extractDir);
      console.debug('📁 Root directory contents:', dirContents);

      // Check each subdirectory
      for (const item of dirContents) {
        const itemPath = path.join(extractDir, item);
        if (this.fs.statSync(itemPath).isDirectory()) {
          const subContents = this.fs.readdirSync(itemPath);
          console.debug(`📁 ${item}/ contents:`, subContents);
        }
      }
    } catch (error) {
      console.warn('Failed to debug directory contents:', error.message);
    }

    const coverageResult = this.findBaselineCoverageFiles(
      extractDir,
      coverageFileName,
    );

    if (!coverageResult) {
      console.warn('⚠️ No coverage data found in baseline artifact');
      return null;
    }

    try {
      if (coverageResult.type === 'summary') {
        // Handle standard coverage-summary.json
        const baselineData = JSON.parse(
          this.fs.readFileSync(coverageResult.path, 'utf8'),
        );
        console.debug('✅ Baseline coverage loaded from summary file');
        return (
          baselineData.details ||
          this.parseCoverageFromSummary({ total: baselineData })
        );
      } else if (coverageResult.type === 'packages') {
        // Handle package-specific coverage.json files
        return this.buildPackagesCoverageDetail(coverageResult.files);
      }
    } catch (error) {
      console.warn(`⚠️ Failed to parse baseline coverage: ${error.message}`);
      return null;
    }

    return null;
  }

  buildPackagesCoverageDetail(coverageFiles) {
    console.debug('🔄 Processing package-specific coverage data...', {
      coverageFiles,
    });

    const packages = [];

    const filesToProcess = Array.isArray(coverageFiles)
      ? coverageFiles
      : coverageFiles?.files || coverageFiles?.packages || [];

    for (const {
      package: pkgName,
      path: filePath,
      coverage,
    } of filesToProcess) {
      try {
        const pkgCoverage =
          coverage || JSON.parse(this.fs.readFileSync(filePath, 'utf8'));
        const displayName = this.desanitizePackageName(pkgName);
        console.debug(`📦 Processing coverage for ${displayName}`);

        // Extract coverage percentages from the coverage JSON (c8/istanbul format)
        const parsedCoverage = this.parseCoverageFromSummary(pkgCoverage);
        packages.push({ package: displayName, coverage: parsedCoverage });
      } catch (error) {
        console.warn(
          `⚠️ Failed to parse coverage for ${pkgName}: ${error.message}`,
        );
      }
    }

    console.debug(`✅ Processed ${packages.length} package coverages`);
    return { type: 'packages', packages };
  }

  cleanupBaselineWorkspace() {
    this.fs.rmSync(this.tempDir, { recursive: true, force: true });
  }

  getPullRequestNumberFromEnv() {
    this.env.refresh();
    try {
      const eventPath = this.env.eventPath;
      if (eventPath && this.fs.existsSync(eventPath)) {
        const eventData = JSON.parse(this.fs.readFileSync(eventPath, 'utf8'));
        if (eventData?.pull_request?.number) {
          return eventData.pull_request.number;
        }
        if (eventData?.issue?.pull_request?.url && eventData?.issue?.number) {
          return eventData.issue.number;
        }
      }
    } catch (error) {
      console.warn(`⚠️ Failed to parse GITHUB_EVENT_PATH: ${error.message}`);
    }

    const ref = this.env.ref || '';
    const match = ref.match(/refs\/pull\/(\d+)\/merge/i);
    if (match) {
      return Number(match[1]);
    }

    return null;
  }

  getArtifactsUrl() {
    this.env.refresh();
    return this.env.getArtifactsUrl();
  }

  async postPrCommentIfAvailable(markdownBody) {
    this.env.refresh();
    const prNumber = this.getPullRequestNumberFromEnv();
    const repoInfo = this.git.parseRepository(this.env.repo);
    const token = this.git.githubToken || this.env.token;

    if (!prNumber || !repoInfo || !token) {
      console.debug(
        '💬 Skipping PR comment: missing PR number, repo info, or GitHub token',
      );
      return;
    }

    const marker = '<!-- coverage-reporter -->';
    const body = `${marker}\n${markdownBody}`;
    const apiUrl = this.env.apiUrl || 'https://api.github.com';
    const commentsUrl = `${apiUrl}/repos/${repoInfo.owner}/${repoInfo.repoName}/issues/${prNumber}/comments`;
    const headers = {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'coverage-reporter',
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    };

    try {
      let existingCommentId = null;

      const listResp = await fetch(`${commentsUrl}?per_page=100`, { headers });
      if (listResp.ok) {
        const comments = await listResp.json();
        const existing = comments.find((c) => c?.body?.includes(marker));
        if (existing) {
          existingCommentId = existing.id;
        }
      } else {
        console.warn(
          `⚠️ Unable to list PR comments (${listResp.status} ${listResp.statusText})`,
        );
      }

      if (existingCommentId) {
        const updateUrl = `${apiUrl}/repos/${repoInfo.owner}/${repoInfo.repoName}/issues/comments/${existingCommentId}`;
        const updateResp = await fetch(updateUrl, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ body }),
        });
        if (!updateResp.ok) {
          console.warn(
            `⚠️ Failed to update PR comment (${updateResp.status} ${updateResp.statusText})`,
          );
        } else {
          console.debug('💬 Updated existing coverage PR comment');
        }
      } else {
        const createResp = await fetch(commentsUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({ body }),
        });
        if (!createResp.ok) {
          console.warn(
            `⚠️ Failed to post PR comment (${createResp.status} ${createResp.statusText})`,
          );
        } else {
          console.debug('💬 Posted coverage PR comment');
        }
      }
    } catch (error) {
      console.warn(`⚠️ Failed to post PR comment: ${error.message}`);
    }
  }

  async getBaselineCoverage(inputs) {
    if (!this.canDownloadBaseLine(inputs)) {
      return null;
    }

    this.env.refresh();
    const repoInfo = this.git.parseRepository(this.env.repo);
    if (!repoInfo) {
      return null;
    }

    let baselineCoverage = null;

    try {
      console.debug(
        `📦 Downloading baseline artifact: ${inputs.baselineArtifactName}`,
        { repoInfo },
      );

      const artifactBuffer = await this.git.downloadLatestArtifact({
        owner: repoInfo.owner,
        repoName: repoInfo.repoName,
        artifactName: inputs.baselineArtifactName,
      });

      if (!artifactBuffer) {
        console.warn('⚠️ No baseline artifact found');
        return null;
      }

      const extractDir = this.prepareBaselineWorkspace();
      this.writeArtifactZip(artifactBuffer);

      if (!this.unpackBaselineZip(this.getBaselineZipPath(), extractDir)) {
        return null;
      }

      baselineCoverage = this.readBaselineCoverage(
        extractDir,
        path.basename(inputs.coverageFile),
      );
      return baselineCoverage;
    } catch (error) {
      console.warn(`⚠️ Failed to download baseline: ${error.message}`);
      return null;
    } finally {
      this.cleanupBaselineWorkspace();
    }
  }
}
