# Contributing to Rockets

Thank you for your interest in contributing to Rockets! This guide will help
you get started.

## Code of Conduct

By participating in this project, you agree to maintain a respectful and
inclusive environment for everyone.

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- Yarn >= 1.22.0 (package manager)

### Setup

1. Fork the repository
1. Clone your fork:

   ```bash
   git clone https://github.com/<your-username>/rockets.git
   cd rockets
   ```

1. Install dependencies:

   ```bash
   yarn install
   ```

1. Build the packages:

   ```bash
   yarn build
   ```

1. Run the tests:

   ```bash
   yarn test
   yarn test:e2e
   ```

## Development Workflow

### Branch Naming

Use descriptive branch names with a prefix:

- `feature/` - New features (e.g., `feature/add-mfa-support`)
- `fix/` - Bug fixes (e.g., `fix/token-refresh-race-condition`)
- `chore/` - Maintenance tasks (e.g., `chore/release-1.0.0-alpha.8`)
- `docs/` - Documentation changes (e.g., `docs/update-auth-guide`)
- `refactor/` - Code refactoring (e.g., `refactor/simplify-admin-module`)

### Commit Messages

Follow the [Conventional Commits](https://www.conventionalcommits.org/)
specification:

```text
feat(auth): add OAuth2 PKCE support
fix(server): handle null user metadata gracefully
chore: bump dependencies
docs: update installation guide
```

### Pull Requests

1. Create a feature branch from `main`
1. Make your changes with clear, focused commits
1. Ensure all checks pass:

   ```bash
   yarn build
   yarn test
   yarn test:e2e
   yarn lint
   ```

1. Push your branch and open a PR against `main`
1. Fill in the PR template with a summary and test plan

### Code Guidelines

- Write TypeScript with strict mode enabled
- Follow existing patterns in the codebase
- Add tests for new functionality (unit and e2e)
- Update relevant documentation when changing behavior
- Keep changes focused and minimal

### Testing

- **Unit tests**: `yarn test`
- **E2E tests**: `yarn test:e2e`
- **Linting**: `yarn lint`
- **Full CI check**: `yarn build && yarn test && yarn test:e2e && yarn lint`

## Project Structure

```text
rockets/
  packages/
    rockets-server/        # Core server module (@bitwild/rockets)
    rockets-server-auth/   # Auth module (@bitwild/rockets-auth)
  development-guides/      # Internal guides and playbooks
```

## Reporting Issues

- Use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.yml)
  for bugs
- Use the [feature request template](.github/ISSUE_TEMPLATE/feature_request.yml)
  for new features
- Use the [package proposal template](.github/ISSUE_TEMPLATE/package_proposal.yml)
  for new packages

## License

By contributing, you agree that your contributions will be licensed under the
BSD-3-Clause License.
