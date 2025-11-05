#!/bin/bash
# Setup script for Rockets Server - NestJS Monorepo

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
echo_step() {
  echo -e "${BLUE}==>${NC} $1"
}

echo_success() {
  echo -e "${GREEN}✓${NC} $1"
}

echo_warning() {
  echo -e "${YELLOW}⚠${NC} $1"
}

echo_error() {
  echo -e "${RED}✗${NC} $1"
}

# Detect environment
if [ "${CLAUDE_CODE_REMOTE:-false}" = "true" ]; then
  ENVIRONMENT="remote"
  echo_step "Running in Claude Code remote environment"
else
  ENVIRONMENT="local"
  echo_step "Running in local environment"
fi

# Start setup
echo ""
echo_step "Setting up Rockets Server development environment..."
echo ""

# Step 1: Verify required files exist
echo_step "Step 1: Verifying project structure..."

if [ ! -f "AGENTS.md" ]; then
  echo_error "AGENTS.md not found! This file should contain project architecture documentation."
  exit 1
fi
echo_success "AGENTS.md found"

if [ ! -f "CLAUDE.md" ]; then
  echo_error "CLAUDE.md not found! This file should import AGENTS.md."
  exit 1
fi
echo_success "CLAUDE.md found"

if [ ! -f "package.json" ]; then
  echo_error "package.json not found! Are you in the project root?"
  exit 1
fi
echo_success "package.json found"

echo ""

# Step 2: Check Node.js version
echo_step "Step 2: Checking Node.js version..."

if ! command -v node &> /dev/null; then
  echo_error "Node.js is not installed!"
  exit 1
fi

NODE_VERSION=$(node -v)
echo_success "Node.js version: $NODE_VERSION"

# Check if Node version is >= 18
NODE_MAJOR=$(echo $NODE_VERSION | cut -d'.' -f1 | sed 's/v//')
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo_warning "Node.js 18+ is recommended. Current version: $NODE_VERSION"
fi

echo ""

# Step 3: Check/Install Yarn
echo_step "Step 3: Checking Yarn installation..."

if ! command -v yarn &> /dev/null; then
  echo_warning "Yarn not found. Installing Yarn..."
  npm install -g yarn
  echo_success "Yarn installed"
else
  YARN_VERSION=$(yarn -v)
  echo_success "Yarn version: $YARN_VERSION"
fi

echo ""

# Step 4: Install dependencies
echo_step "Step 4: Installing project dependencies..."

if [ ! -d "node_modules" ]; then
  echo_step "Running yarn install (this may take a few minutes)..."
  yarn install
  echo_success "Dependencies installed"
else
  echo_step "node_modules exists, checking if dependencies are up to date..."
  yarn install --check-files
  echo_success "Dependencies verified"
fi

echo ""

# Step 5: Build TypeScript
echo_step "Step 5: Building TypeScript project..."

# Check if dist directories exist
if [ ! -d "packages/rockets-server/dist" ] || [ ! -d "packages/rockets-server-auth/dist" ]; then
  echo_step "Running yarn build (first build may take a while)..."
  yarn build
  echo_success "Build completed"
else
  echo_step "Build artifacts exist, verifying..."
  yarn build
  echo_success "Build verified"
fi

echo ""

# Step 6: Verify TypeScript compilation
echo_step "Step 6: Verifying TypeScript compilation..."

if [ -d "packages/rockets-server/dist" ] && [ -d "packages/rockets-server-auth/dist" ]; then
  echo_success "TypeScript compilation successful"
  echo_success "  - packages/rockets-server/dist"
  echo_success "  - packages/rockets-server-auth/dist"
else
  echo_error "TypeScript compilation failed - dist directories not found"
  exit 1
fi

echo ""

# Step 7: Run linting (non-blocking)
echo_step "Step 7: Running linting checks..."

if yarn lint --quiet > /dev/null 2>&1; then
  echo_success "Linting passed"
else
  echo_warning "Linting issues found (non-blocking)"
  echo_warning "Run 'yarn lint:fix' to auto-fix issues"
fi

echo ""

# Step 8: Verify test setup
echo_step "Step 8: Verifying test configuration..."

if [ -f "jest.config.json" ] && [ -f "jest.config-e2e.json" ]; then
  echo_success "Jest configuration found"
  echo_success "  - jest.config.json (unit tests)"
  echo_success "  - jest.config-e2e.json (e2e tests)"
else
  echo_warning "Jest configuration incomplete"
fi

echo ""

# Step 9: Display project info
echo_step "Step 9: Project information..."

PROJECT_VERSION=$(node -e "console.log(require('./package.json').version)")
echo_success "Project version: $PROJECT_VERSION"

# Count packages
PACKAGE_COUNT=$(find packages -name "package.json" | wc -l)
echo_success "Packages in monorepo: $PACKAGE_COUNT"

# List packages
echo_success "Packages:"
for pkg in packages/*/package.json; do
  PKG_NAME=$(node -e "console.log(require('./$pkg').name)")
  PKG_VERSION=$(node -e "console.log(require('./$pkg').version)")
  echo_success "  - $PKG_NAME@$PKG_VERSION"
done

echo ""

# Final summary
echo ""
echo_step "=========================================="
echo_success "Setup completed successfully!"
echo_step "=========================================="
echo ""
echo "Available commands:"
echo "  ${GREEN}yarn build${NC}         Build all packages"
echo "  ${GREEN}yarn test${NC}          Run unit tests"
echo "  ${GREEN}yarn test:e2e${NC}      Run end-to-end tests"
echo "  ${GREEN}yarn test:all${NC}      Run all tests"
echo "  ${GREEN}yarn lint${NC}          Check code style"
echo "  ${GREEN}yarn lint:fix${NC}      Fix code style issues"
echo "  ${GREEN}yarn clean${NC}         Clean build artifacts"
echo "  ${GREEN}yarn doc${NC}           Generate documentation"
echo ""
echo "Documentation:"
echo "  ${BLUE}AGENTS.md${NC}          Project architecture & context"
echo "  ${BLUE}CLAUDE.md${NC}          Claude Code configuration"
echo "  ${BLUE}README.md${NC}          Project overview"
echo ""
echo "Happy coding! 🚀"
echo ""
