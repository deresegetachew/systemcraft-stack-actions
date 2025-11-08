import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import { ShellUtil, GitUtil } from '@systemcraft-stack-actions/utils';

export class CoverageReporterService {
  constructor(shellUtil, fsApi, gitUtil) {
    this.shell = shellUtil || new ShellUtil();
    this.fs = fsApi || fs;
    this.git = gitUtil || new GitUtil(this.shell, process.env.GITHUB_TOKEN);
    this.tempDir = path.join(os.tmpdir(), 'coverage-baseline');
  }

  static create() {
    return new CoverageReporterService();
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
      enableDiff: Boolean(inputs.enableDiff),
      enablePrComments: Boolean(inputs.enablePrComments),
      minimumCoverage: Number(inputs.minimumCoverage ?? 0),
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
    const overallCoverage = this.calculateOverallCoverage(coverage);

    return {
      overall: overallCoverage,
      details: coverage,
      baseline: baselineCoverage,
      timestamp: new Date().toISOString(),
      minimumCoverage,
      status: overallCoverage >= minimumCoverage ? 'pass' : 'fail',
    };
  }

  persistSummaryFiles(summary, coverage, inputs) {
    const summaryPath = path.join(inputs.outputDir, 'coverage-summary.json');
    this.fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

    if (!inputs.enablePrComments) {
      return;
    }

    const markdownReport = this.generateMarkdownReport(
      coverage,
      inputs.minimumCoverage,
      summary.baseline,
    );
    const reportPath = path.join(inputs.outputDir, 'coverage-report.md');
    this.fs.writeFileSync(reportPath, markdownReport);
    console.log(`✅ Coverage report saved to ${reportPath}`);
  }

  copyHtmlReports(outputDir) {
    if (!this.fs.existsSync('coverage')) {
      return;
    }

    console.log('📋 Copying HTML coverage reports...');
    this.shell.exec(`cp -r coverage ${path.join(outputDir, 'html-report')}`);
  }

  logFinalStats(summary, baselineCoverage) {
    console.log('🎉 Coverage reporting completed!');
    console.log(`📊 Overall coverage: ${summary.overall.toFixed(2)}%`);

    if (!baselineCoverage) {
      return;
    }

    const baselineOverall = this.calculateOverallCoverage(baselineCoverage);
    const diff = summary.overall - baselineOverall;
    const diffIcon = diff > 0 ? '⬆️' : diff < 0 ? '⬇️' : '➡️';
    console.log(
      `📈 Coverage change: ${diff > 0 ? '+' : ''}${diff.toFixed(2)}% ${diffIcon}`,
    );
  }

  runCoverage(coverageCommand) {
    console.log(`🧪 Running coverage command: ${coverageCommand}`);
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
    const { total } = summary;
    return {
      statements: total.statements.pct,
      branches: total.branches.pct,
      functions: total.functions.pct,
      lines: total.lines.pct,
    };
  }

  calculateOverallCoverage(coverage) {
    return (
      (coverage.statements +
        coverage.branches +
        coverage.functions +
        coverage.lines) /
      4
    );
  }

  generateMarkdownReport(coverage, minimumCoverage, baselineCoverage = null) {
    const overallCoverage = this.calculateOverallCoverage(coverage);

    const getStatus = (percentage) => {
      if (percentage >= 80) return '✅ Good';
      if (percentage >= 60) return '⚠️ Fair';
      return '❌ Poor';
    };

    const getChangeIcon = (percentage, minimum) => {
      if (percentage >= minimum) return '✅';
      return '❌';
    };

    const getDiffIcon = (current, baseline) => {
      if (!baseline) return '';
      const diff = current - baseline;
      if (Math.abs(diff) < 0.01) return ' ➡️'; // No change
      return diff > 0 ? ' ⬆️' : ' ⬇️';
    };

    const formatDiff = (current, baseline) => {
      if (!baseline) return '';
      const diff = current - baseline;
      if (Math.abs(diff) < 0.01) return '';
      const sign = diff > 0 ? '+' : '';
      return ` (${sign}${diff.toFixed(2)}%)`;
    };

    let report = `## 📊 Coverage Report\n\n`;

    const baselineOverall = baselineCoverage
      ? this.calculateOverallCoverage(baselineCoverage)
      : null;
    const overallDiff = getDiffIcon(overallCoverage, baselineOverall);
    const overallChange = formatDiff(overallCoverage, baselineOverall);

    report += `### Overall Coverage: ${overallCoverage.toFixed(2)}%${overallChange}${overallDiff} ${getChangeIcon(overallCoverage, minimumCoverage)}\n\n`;

    report += `| Metric | Coverage | Status |\n`;
    report += `|--------|----------|--------|\n`;

    const metrics = [
      { key: 'statements', label: 'Statements' },
      { key: 'branches', label: 'Branches' },
      { key: 'functions', label: 'Functions' },
      { key: 'lines', label: 'Lines' },
    ];

    for (const metric of metrics) {
      const current = coverage[metric.key];
      const baseline = baselineCoverage?.[metric.key];
      const diff = getDiffIcon(current, baseline);
      const change = formatDiff(current, baseline);

      report += `| **${metric.label}** | ${current.toFixed(2)}%${change}${diff} | ${getStatus(current)} |\n`;
    }

    report += '\n';

    if (overallCoverage < minimumCoverage) {
      report += `⚠️ **Coverage is below minimum threshold of ${minimumCoverage}%**\n\n`;
    }

    if (baselineCoverage) {
      report += `📊 *Comparison with baseline from previous successful run*\n\n`;
    }

    report += `---\n`;
    report += `*Report generated by [Coverage Reporter](https://github.com/deresegetachew/systemcraft-stack-actions)*`;

    return report;
  }

  getCoverage(inputs) {
    if (this.shouldLoadCoverageFromFile(inputs.coverageFile)) {
      return this.readCoverageFromFile(inputs.coverageFile);
    }

    if (!inputs.coverageCommand) {
      throw new Error('Coverage command not provided');
    }

    const coverageResult = this.runCoverage(inputs.coverageCommand);

    if (!coverageResult.success) {
      throw new Error(`Coverage command failed: ${coverageResult.error}`);
    }

    return this.parseCoverageFromOutput(coverageResult.output);
  }

  shouldDownloadBaseline(inputs) {
    if (!inputs.enableDiff || !inputs.baselineArtifactName) {
      console.log(
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

  parseRepository(repo) {
    const [owner, repoName] = (repo || '').split('/');
    if (!owner || !repoName) {
      console.warn(`⚠️ Could not parse repository "${repo}"`);
      return null;
    }
    return { owner, repoName };
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

  findBaselineSummaryFile(extractDir) {
    const possiblePaths = [
      path.join(extractDir, 'coverage-summary.json'),
      path.join(extractDir, 'coverage-artifacts', 'coverage-summary.json'),
      path.join(extractDir, 'coverage', 'coverage-summary.json'),
    ];

    return possiblePaths.find((summaryPath) => this.fs.existsSync(summaryPath));
  }

  readBaselineCoverage(extractDir) {
    const summaryPath = this.findBaselineSummaryFile(extractDir);

    if (!summaryPath) {
      console.warn('⚠️ No coverage summary found in baseline artifact');
      return null;
    }

    const baselineData = JSON.parse(this.fs.readFileSync(summaryPath, 'utf8'));
    console.log('✅ Baseline coverage loaded successfully');
    return (
      baselineData.details ||
      this.parseCoverageFromSummary({ total: baselineData })
    );
  }

  cleanupBaselineWorkspace() {
    this.fs.rmSync(this.tempDir, { recursive: true, force: true });
  }

  async downloadBaseline(inputs) {
    if (!this.shouldDownloadBaseline(inputs)) {
      return null;
    }

    const repoInfo = this.parseRepository(process.env.GITHUB_REPOSITORY);
    if (!repoInfo) {
      return null;
    }

    let baselineCoverage = null;

    try {
      console.log(
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

      baselineCoverage = this.readBaselineCoverage(extractDir);
      return baselineCoverage;
    } catch (error) {
      console.warn(`⚠️ Failed to download baseline: ${error.message}`);
      return null;
    } finally {
      this.cleanupBaselineWorkspace();
    }
  }

  async run(inputs) {
    console.log('🚀 Starting coverage reporting...');

    const normalizedInputs = this.normalizeInputs(inputs);
    this.ensureDirectory(normalizedInputs.outputDir);

    const baselineCoverage = await this.downloadBaseline(normalizedInputs);
    const coverage = this.getCoverage(normalizedInputs);

    console.log(`Coverage data: ${JSON.stringify(coverage, null, 2)}`);

    const summary = this.createSummary(
      coverage,
      baselineCoverage,
      normalizedInputs.minimumCoverage,
    );

    this.persistSummaryFiles(summary, coverage, normalizedInputs);
    this.copyHtmlReports(normalizedInputs.outputDir);
    this.logFinalStats(summary, baselineCoverage);

    return {
      coveragePercentage: summary.overall.toFixed(2),
      status: summary.status,
      artifactsPath: normalizedInputs.outputDir,
      summary,
      baselineCoverage,
    };
  }
}
