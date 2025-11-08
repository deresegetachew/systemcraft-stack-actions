# SystemCraft Stack Actions

A collection of reusable GitHub Actions for SystemCraft projects and other TypeScript/JavaScript projects using changesets for version management.

## Available Actions

### � Coverage Reporter

**Location:** `deresegetachew/systemcraft-stack-actions/actions/coverage-reporter@main`

Collects test coverage, generates reports, and posts PR comments with coverage analysis. Perfect for maintaining code quality standards across your projects.

**Features:**

- Runs configurable coverage commands
- Generates comprehensive markdown reports
- Posts sticky PR comments with coverage analysis
- Supports minimum coverage thresholds
- Exports coverage artifacts and HTML reports

**Inputs:**

- `coverage-command` (optional): Command to run tests with coverage (default: `pnpm test -- --coverage`)
- `coverage-format` (optional): Coverage output format (default: `lcov`)
- `output-dir` (optional): Directory to output coverage artifacts (default: `coverage-artifacts`)
- `enable-pr-comments` (optional): Enable coverage comments on PRs (default: `true`)
- `minimum-coverage` (optional): Minimum coverage threshold percentage (default: `80`)
- `github-token` (optional): GitHub token for API access

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

### Basic Workflow with Coverage

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

      # Generate coverage reports
      - uses: deresegetachew/systemcraft-stack-actions/actions/coverage-reporter@main
        with:
          coverage-command: 'pnpm test -- --coverage'
          minimum-coverage: '80'

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

## License

MIT
