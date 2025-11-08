# SystemCraft Stack Actions

A collection of reusable GitHub Actions for SystemCraft projects and other TypeScript/JavaScript projects using changesets for version management.

## Available Actions

### 📊 Coverage Reporter

**Location:** `deresegetachew/systemcraft-stack-actions/actions/coverage-reporter@main`

Collects test coverage, generates rich markdown summaries, and optionally posts sticky PR comments with baseline comparisons.

**Highlights**

- Accepts either a `coverage-file` (skips executing a command) or runs the supplied `coverage-command`.
- Emits `coverage-summary.json`, `coverage-report.md` (when PR comments are enabled), and a full HTML report under `html-report/`.
- Enforces configurable minimum thresholds and clearly reports pass/fail status.
- Supports baseline diffing via GitHub artifacts with clear trend indicators (⬆️⬇️➡️).
- Works in any workflow thanks to dependency injection-friendly internals and optional GitHub token usage.

**Inputs**

- `coverage-command` (optional): Command used when no `coverage-file` is provided. Default `pnpm test -- --coverage`.
- `coverage-file` (optional): Existing `coverage-summary.json`. When present it is preferred over running the command.
- `coverage-format`: Coverage output format (`lcov`, `json`, `text`). Default `lcov`.
- `output-dir`: Where artifacts are written. Default `coverage-artifacts`.
- `enable-pr-comments`: Writes `coverage-report.md` for sticky comments. Default `true`.
- `minimum-coverage`: Overall threshold used for pass/fail and table badges. Default `80`.
- `github-token`: Token used for downloading baseline artifacts. Defaults to `${{ github.token }}`.
- `enable-diff`: Turns on baseline download/comparison. Default `true`.
- `baseline-artifact-name`: Artifact to download (e.g., `coverage-baseline-main`).
- `base-branch`: Informational input for workflows (commonly `${{ github.base_ref || 'main' }}`).

**Outputs**

- `coverage-percentage`: Overall average of statements/branches/functions/lines.
- `coverage-status`: `pass` or `fail` based on `minimum-coverage`.
- `artifacts-path`: Directory that now contains `coverage-summary.json`, optional markdown report, and the HTML export.

**Generated Artifacts**

1. `coverage-summary.json` – machine-readable snapshot consumed by future runs.
2. `coverage-report.md` – human-friendly table used for PR comments (only when `enable-pr-comments` is true).
3. `html-report/` – copy of any `coverage` folder produced by the test runner.

**Baseline Diff Workflow**

1. Enable `enable-diff` and pass both `baseline-artifact-name` and a token with `actions:read`.
2. On your base branch (e.g., `main`), upload the current `coverage-artifacts/**` so future PRs have something to compare against.
3. On PRs, the action downloads the latest artifact, extracts `coverage-summary.json`, and annotates the markdown table with diffs plus overall trend arrows.

**Example with baseline comparison**

```yaml
- name: Generate coverage with baseline comparison
  uses: deresegetachew/systemcraft-stack-actions/actions/coverage-reporter@main
  with:
    coverage-command: 'pnpm test -- --coverage'
    minimum-coverage: '80'
    enable-pr-comments: ${{ github.event_name == 'pull_request' }}
    enable-diff: ${{ github.event_name == 'pull_request' }}
    baseline-artifact-name: ${{ github.event_name == 'pull_request' && format('coverage-baseline-{0}', github.base_ref) || '' }}
    base-branch: ${{ github.base_ref || 'main' }}
```

### �🔍 Changeset Validator

**Location:** `deresegetachew/systemcraft-stack-actions/actions/changeset-validator@main`

Validates that pull requests include required changeset files for proper version tracking. Automatically skips validation for version bump PRs, bot accounts, and PRs with skip labels.

**Features:**

- Detects missing changeset files in pull requests
- Smart skip logic for version PRs and automated bots
- Configurable skip labels and commit patterns
- Comprehensive error messages with guidance

**Inputs:**

- `skip-label` (optional): Custom label to skip changeset validation
- `fetch-branches` (optional): Whether to fetch remote branches

### � Plan Maintenance Branches

**Location:** `deresegetachew/systemcraft-stack-actions/actions/plan-maintenance-branches@main`

Analyzes changesets for major version bumps and creates maintenance branch plans for multi-release workflows. Runs `changeset version` to update package versions.

**Features:**

- Detects major version bumps from changesets
- Creates maintenance branch plans with proper naming
- Runs changeset version command automatically
- Integrates with multi-release workflow patterns

**Inputs:**

- `working-directory` (optional): Directory to run changeset commands in

### 🚀 Release with Branching

**Location:** `deresegetachew/systemcraft-stack-actions/actions/release-with-branching@main`

Publishes packages to npm and creates maintenance branches based on plans. Handles complex release workflows with automatic branch creation and management.

**Features:**

- Publishes packages to npm with `changeset publish`
- Creates maintenance branches from previous commits
- Multi-release workflow support
- Comprehensive validation and precondition checks

**Inputs:**

- `working-directory` (optional): Directory to run release commands in
- `npm-token` (required): NPM authentication token for publishing

## Usage Examples

### Basic Workflow with Coverage and Baseline Comparison

```yaml
name: CI/CD
on:
  pull_request:
  push:
    branches: [main]

jobs:
  test-and-coverage:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write # Required for coverage comments
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      # Validate changesets on PRs
      - uses: deresegetachew/systemcraft-stack-actions/actions/changeset-validator@main
        if: github.event_name == 'pull_request'

      # Generate coverage reports with baseline comparison
      - uses: deresegetachew/systemcraft-stack-actions/actions/coverage-reporter@main
        with:
          coverage-command: 'pnpm test -- --coverage'
          minimum-coverage: '80'
          enable-diff: ${{ github.event_name == 'pull_request' }}
          baseline-artifact-name: ${{ github.event_name == 'pull_request' && format('coverage-baseline-{0}', github.base_ref) || '' }}
          base-branch: ${{ github.base_ref || 'main' }}

      # Upload coverage artifacts
      - uses: actions/upload-artifact@v4
        with:
          name: coverage-artifacts
          path: coverage-artifacts/**

      # Save coverage as baseline for future PR comparisons (on push to main)
      - name: Upload coverage baseline
        if: github.event_name == 'push' && github.ref_name == 'main'
        uses: actions/upload-artifact@v4
        with:
          name: coverage-baseline-main
          path: coverage-artifacts/**
          retention-days: 90

  version:
    if: github.event_name == 'push'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: deresegetachew/systemcraft-stack-actions/actions/plan-maintenance-branches@main

  publish:
    if: github.event_name == 'push'
    needs: version
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: deresegetachew/systemcraft-stack-actions/actions/release-with-branching@main
        with:
          npm-token: ${{ secrets.NPM_TOKEN }}
```

## Development

This repository uses pnpm workspaces and contains comprehensive test suites for all actions.

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Build actions
pnpm build
```

## Platform Compatibility

These actions are designed to work with GitHub.com, GitHub Enterprise Server, and other GitHub-compatible platforms. The actions automatically respect the following environment variables for platform compatibility:

- `GITHUB_API_URL`: Base URL for the GitHub REST API (defaults to `https://api.github.com`)
- `GITHUB_GRAPHQL_URL`: Base URL for the GitHub GraphQL API (defaults to `https://api.github.com/graphql`)
- `GITHUB_SERVER_URL`: Base URL for the GitHub instance (defaults to `https://github.com`)

All actions use the `@actions/github` toolkit which automatically configures the correct endpoints based on these environment variables. No additional configuration is required.

## License

MIT
