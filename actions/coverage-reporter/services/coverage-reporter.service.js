import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import { ShellUtil, GitUtil } from '@systemcraft-stack-actions/utils';

export class CoverageReporterService {
  constructor(shellUtil, fsApi, gitUtil) {
    this.shell = shellUtil || new ShellUtil();
    this.fs = fsApi || fs;
    this.git = gitUtil || new GitUtil(this.shell); // Initialize with no token, will be set in run method
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
      return this.createPackageComparisonSummary(
        coverage,
        baselineCoverage,
        minimumCoverage,
      );
    }

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

  createPackageComparisonSummary(
    currentCoverage,
    baselineCoverage,
    minimumCoverage,
  ) {
    const packageComparisons = [];
    let totalCoverage = { statements: 0, branches: 0, functions: 0, lines: 0 };
    let totalPackages = 0;

    // Parse baseline coverage into a map for easy lookup
    const baselineMap = new Map();
    if (baselineCoverage?.type === 'packages') {
      for (const pkg of baselineCoverage.packages) {
        baselineMap.set(pkg.package, pkg.coverage);
      }
    }

    // Process each current package
    for (const { package: pkgName, path: filePath } of currentCoverage.files) {
      try {
        const pkgCoverageData = JSON.parse(
          this.fs.readFileSync(filePath, 'utf8'),
        );
        const pkgCoverage = this.parseCoverageFromSummary(pkgCoverageData);
        const baselinePkgCoverage = baselineMap.get(pkgName) || null;

        packageComparisons.push({
          package: pkgName,
          coverage: pkgCoverage,
          baseline: baselinePkgCoverage,
          status:
            this.calculateOverallCoverage(pkgCoverage) >= minimumCoverage
              ? 'pass'
              : 'fail',
        });

        // Add to total for overall calculation
        totalCoverage.statements += pkgCoverage.statements;
        totalCoverage.branches += pkgCoverage.branches;
        totalCoverage.functions += pkgCoverage.functions;
        totalCoverage.lines += pkgCoverage.lines;
        totalPackages++;
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

    const overall = this.calculateOverallCoverage(overallCoverage);

    return {
      type: 'packages',
      overall,
      packages: packageComparisons,
      timestamp: new Date().toISOString(),
      minimumCoverage,
      status: overall >= minimumCoverage ? 'pass' : 'fail',
    };
  }

  persistSummaryFiles(summary, coverage, inputs) {
    const summaryPath = path.join(inputs.outputDir, 'coverage-summary.json');
    this.fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

    if (!inputs.enablePrComments) {
      return;
    }

    const markdownReport = this.generateMarkdownReport(
      summary.type === 'packages' ? summary : coverage,
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

    if (summary.type === 'packages') {
      console.log(`📦 Package breakdown:`);
      for (const pkg of summary.packages) {
        const overallCoverage = this.calculateOverallCoverage(pkg.coverage);
        const baselineOverall = pkg.baseline
          ? this.calculateOverallCoverage(pkg.baseline)
          : null;

        if (baselineOverall !== null) {
          const diff = overallCoverage - baselineOverall;
          const diffIcon = diff > 0 ? '⬆️' : diff < 0 ? '⬇️' : '➡️';
          console.log(
            `  📋 ${pkg.package}: ${overallCoverage.toFixed(2)}% (${diff > 0 ? '+' : ''}${diff.toFixed(2)}% ${diffIcon})`,
          );
        } else {
          console.log(`  📋 ${pkg.package}: ${overallCoverage.toFixed(2)}%`);
        }
      }
      return;
    }

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
    // Handle per-package coverage reports
    if (coverage.type === 'packages') {
      return this.generatePackageMarkdownReport(
        coverage,
        minimumCoverage,
        baselineCoverage,
      );
    }

    // Original single-coverage report logic
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

  generatePackageMarkdownReport(
    summary,
    minimumCoverage,
    baselineCoverage = null,
  ) {
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
      if (Math.abs(diff) < 0.01) return ' ➡️';
      return diff > 0 ? ' ⬆️' : ' ⬇️';
    };

    const formatDiff = (current, baseline) => {
      if (!baseline) return '';
      const diff = current - baseline;
      if (Math.abs(diff) < 0.01) return '';
      const sign = diff > 0 ? '+' : '';
      return ` (${sign}${diff.toFixed(2)}%)`;
    };

    let report = `## 📊 Coverage Report by Package\n\n`;
    report += `### Overall Coverage: ${summary.overall.toFixed(2)}% ${getChangeIcon(summary.overall, minimumCoverage)}\n\n`;

    // Package-by-package breakdown
    for (const pkg of summary.packages) {
      const { package: pkgName, coverage, baseline } = pkg;
      const overallCoverage = this.calculateOverallCoverage(coverage);
      const baselineOverall = baseline
        ? this.calculateOverallCoverage(baseline)
        : null;

      const overallDiff = getDiffIcon(overallCoverage, baselineOverall);
      const overallChange = formatDiff(overallCoverage, baselineOverall);

      report += `#### 📦 ${pkgName}\n`;
      report += `**Overall: ${overallCoverage.toFixed(2)}%${overallChange}${overallDiff}** ${getChangeIcon(overallCoverage, minimumCoverage)}\n\n`;

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
          report += `| **${metric.label}** | ${current.toFixed(2)}% | ${baselineValue?.toFixed(2) || 'N/A'}% | ${change}${diff} | ${getStatus(current)} |\n`;
        } else {
          report += `| **${metric.label}** | ${current.toFixed(2)}% | ${getStatus(current)} |\n`;
        }
      }

      report += '\n';
    }

    if (summary.overall < minimumCoverage) {
      report += `⚠️ **Overall coverage is below minimum threshold of ${minimumCoverage}%**\n\n`;
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

    report += `---\n`;
    report += `*Report generated by [Coverage Reporter](https://github.com/deresegetachew/systemcraft-stack-actions)*`;

    return report;
  }

  aggregatePackageCoverage(packageCoverage) {
    let totalCoverage = { statements: 0, branches: 0, functions: 0, lines: 0 };
    let totalPackages = 0;

    for (const { package: pkgName, path: filePath } of packageCoverage.files) {
      try {
        const pkgCoverageData = JSON.parse(
          this.fs.readFileSync(filePath, 'utf8'),
        );
        const pkgCoverage = this.parseCoverageFromSummary(pkgCoverageData);

        totalCoverage.statements += pkgCoverage.statements;
        totalCoverage.branches += pkgCoverage.branches;
        totalCoverage.functions += pkgCoverage.functions;
        totalCoverage.lines += pkgCoverage.lines;
        totalPackages++;
      } catch (error) {
        console.warn(
          `⚠️ Failed to parse current coverage for ${pkgName}: ${error.message}`,
        );
      }
    }

    if (totalPackages > 0) {
      return {
        statements: totalCoverage.statements / totalPackages,
        branches: totalCoverage.branches / totalPackages,
        functions: totalCoverage.functions / totalPackages,
        lines: totalCoverage.lines / totalPackages,
      };
    }

    return { statements: 0, branches: 0, functions: 0, lines: 0 };
  }

  getCoverage(inputs) {
    let coverageData = this.loadCurrentCoverage(
      inputs.outputDir,
      inputs.coverageFile,
    );

    if (coverageData) {
      console.log('✅ Using coverage data from artifacts directory');
    } else if (this.shouldLoadCoverageFromFile(inputs.coverageFile)) {
      console.log(`📄 Loading coverage from file: ${inputs.coverageFile}`);
      coverageData = this.readCoverageFromFile(inputs.coverageFile);
    } else {
      if (!inputs.coverageCommand) {
        throw new Error(
          'Coverage command not provided and no coverage artifacts found',
        );
      }
      console.log('🧪 No existing coverage found, running coverage command...');
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
        console.log('✅ Using coverage data generated in artifacts directory');
      } else if (this.shouldLoadCoverageFromFile(inputs.coverageFile)) {
        console.log(
          `📄 Loading coverage from generated file: ${inputs.coverageFile}`,
        );
        coverageData = this.readCoverageFromFile(inputs.coverageFile);
      } else {
        console.log('📄 Parsing coverage from command output...');
        coverageData = this.parseCoverageFromOutput(coverageResult.output);
      }
    }

    if (coverageData && coverageData.type === 'packages') {
      console.log('📦 Aggregating package coverage...');
      return this.aggregatePackageCoverage(coverageData);
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
        console.log(
          `📦 Found ${packagesWithCoverage.length} current coverage packages`,
        );
        return { type: 'packages', files: packagesWithCoverage };
      }

      // Fallback: try to read from coverage file in output directory
      const summaryPath = path.join(outputDir, path.basename(coverageFile));
      if (this.fs.existsSync(summaryPath)) {
        console.log(
          `📊 Using ${path.basename(coverageFile)} from output directory`,
        );
        return this.readCoverageFromFile(summaryPath);
      }
    } catch (error) {
      console.warn('Failed to load current coverage:', error.message);
    }

    return null;
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

  findBaselineCoverageFiles(extractDir) {
    const coverageFiles = [];

    // First, try standard coverage-summary.json locations
    const possibleSummaryPaths = [
      path.join(extractDir, 'coverage-summary.json'),
      path.join(extractDir, 'coverage-artifacts', 'coverage-summary.json'),
      path.join(extractDir, 'coverage', 'coverage-summary.json'),
      path.join(
        extractDir,
        'coverage-artifacts',
        'coverage',
        'coverage-summary.json',
      ),
      path.join(extractDir, 'dist', 'coverage-summary.json'),
      path.join(extractDir, 'artifacts', 'coverage-summary.json'),
    ];

    for (const summaryPath of possibleSummaryPaths) {
      if (this.fs.existsSync(summaryPath)) {
        console.log(`✅ Found coverage summary at: ${summaryPath}`);
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
        console.log(
          `✅ Found ${coverageFiles.length} package-specific coverage files`,
        );
        return { type: 'packages', files: coverageFiles };
      }
    } catch (error) {
      console.warn('Failed to scan for coverage files:', error.message);
    }

    return null;
  }

  readBaselineCoverage(extractDir) {
    // Debug: show what's actually in the extracted directory
    console.log('🔍 Debugging extracted artifact contents...');
    try {
      const dirContents = this.fs.readdirSync(extractDir);
      console.log('📁 Root directory contents:', dirContents);

      // Check each subdirectory
      for (const item of dirContents) {
        const itemPath = path.join(extractDir, item);
        if (this.fs.statSync(itemPath).isDirectory()) {
          const subContents = this.fs.readdirSync(itemPath);
          console.log(`📁 ${item}/ contents:`, subContents);
        }
      }
    } catch (error) {
      console.warn('Failed to debug directory contents:', error.message);
    }

    const coverageResult = this.findBaselineCoverageFiles(extractDir);

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
        console.log('✅ Baseline coverage loaded from summary file');
        return (
          baselineData.details ||
          this.parseCoverageFromSummary({ total: baselineData })
        );
      } else if (coverageResult.type === 'packages') {
        // Handle package-specific coverage.json files
        return this.combinePackageCoverage(coverageResult.files);
      }
    } catch (error) {
      console.warn(`⚠️ Failed to parse baseline coverage: ${error.message}`);
      return null;
    }

    return null;
  }

  combinePackageCoverage(coverageFiles) {
    console.log('🔄 Processing package-specific coverage data...');

    const packages = [];

    for (const { package: pkgName, path: filePath } of coverageFiles) {
      try {
        const pkgCoverage = JSON.parse(this.fs.readFileSync(filePath, 'utf8'));
        console.log(`📦 Processing coverage for ${pkgName}`);

        // Extract coverage percentages from the coverage JSON (c8/istanbul format)
        const coverage = this.parseCoverageFromSummary(pkgCoverage);
        packages.push({ package: pkgName, coverage });
      } catch (error) {
        console.warn(
          `⚠️ Failed to parse coverage for ${pkgName}: ${error.message}`,
        );
      }
    }

    console.log(`✅ Processed ${packages.length} package coverages`);
    return { type: 'packages', packages };
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

    // Ensure Git client always has the latest token (from inputs or env)
    this.git.githubToken =
      normalizedInputs.githubToken ||
      process.env.GITHUB_TOKEN ||
      this.git.githubToken;

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
