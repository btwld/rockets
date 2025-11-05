#!/bin/bash
# Setup script for Rockets - Enterprise Authentication Framework
# Compatible with both local and Claude Code remote environments

set -e  # Exit immediately if a command exits with a non-zero status
set -u  # Treat unset variables as an error

# ANSI color codes for output
readonly GREEN='\033[0;32m'
readonly BLUE='\033[0;34m'
readonly YELLOW='\033[1;33m'
readonly RED='\033[0;31m'
readonly NC='\033[0m'

# Logging functions
log_info() {
  echo -e "${BLUE}ℹ${NC} $1"
}

log_success() {
  echo -e "${GREEN}✓${NC} $1"
}

log_warning() {
  echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
  echo -e "${RED}✗${NC} $1"
  exit 1
}

log_step() {
  echo ""
  echo -e "${BLUE}▶${NC} ${GREEN}$1${NC}"
  echo "─────────────────────────────────────────────────"
}

# Detect environment
detect_environment() {
  if [ "${CLAUDE_CODE_REMOTE:-false}" = "true" ]; then
    log_info "Environment: Claude Code Remote"
    export IS_REMOTE=true
  else
    log_info "Environment: Local"
    export IS_REMOTE=false
  fi
}

# Setup Claude Code memory symlink
setup_claude_memory() {
  log_step "Setting up Claude Code memory"

  if [ ! -f "AGENTS.md" ]; then
    log_warning "AGENTS.md not found, skipping symlink creation"
    return 0
  fi

  # Remove existing CLAUDE.local.md if it's a regular file
  if [ -f "CLAUDE.local.md" ] && [ ! -L "CLAUDE.local.md" ]; then
    log_info "Removing existing CLAUDE.local.md file"
    rm "CLAUDE.local.md"
  fi

  # Create symlink if it doesn't exist
  if [ ! -e "CLAUDE.local.md" ]; then
    log_info "Creating symlink: CLAUDE.local.md -> AGENTS.md"
    ln -s AGENTS.md CLAUDE.local.md
    log_success "Symlink created successfully"
  else
    log_info "CLAUDE.local.md already exists"
  fi

  # Verify the symlink
  if [ -L "CLAUDE.local.md" ]; then
    local target=$(readlink CLAUDE.local.md)
    log_success "CLAUDE.local.md -> $target"
  fi
}

# Setup PATH for tools
setup_path() {
  log_step "Setting up environment PATH"

  # Add common tool paths
  export PATH="$HOME/.local/bin:$PATH"
  export PATH="$HOME/.cargo/bin:$PATH"
  export PATH="$HOME/.local/share/mise/shims:$PATH"

  # Yarn/Node paths
  if [ -d "$HOME/.yarn/bin" ]; then
    export PATH="$HOME/.yarn/bin:$PATH"
  fi

  log_success "PATH configured"
}

# Check Node.js and Yarn
check_tools() {
  log_step "Checking required tools"

  # Check Node.js
  if ! command -v node &> /dev/null; then
    log_error "Node.js not found. Please install Node.js >=18.0.0"
  fi

  local node_version=$(node --version | sed 's/v//')
  log_info "Node.js version: v${node_version}"

  # Check if Node.js version is >= 18
  local major_version=$(echo "$node_version" | cut -d. -f1)
  if [ "$major_version" -lt 18 ]; then
    log_warning "Node.js version is below 18.0.0. Upgrade recommended."
  fi

  # Enable Corepack (required for Yarn 4.4.0)
  if command -v corepack &> /dev/null; then
    log_info "Enabling Corepack..."
    corepack enable 2>/dev/null || true
    log_success "Corepack enabled"
  else
    log_warning "Corepack not available. Will try using existing Yarn."
  fi

  # Verify Yarn is available
  if command -v yarn &> /dev/null; then
    local yarn_version=$(yarn --version 2>/dev/null || echo "unknown")
    log_info "Yarn version: ${yarn_version}"
    log_success "Tools verified"
  else
    log_error "Yarn not found. Please install Yarn manually."
  fi
}

# Install dependencies
install_dependencies() {
  log_step "Installing dependencies"

  # Check if node_modules exists and is recent
  if [ -d "node_modules" ]; then
    local node_modules_age=$(find node_modules -maxdepth 0 -mmin +60 2>/dev/null | wc -l)
    if [ "$node_modules_age" -eq 0 ]; then
      log_info "node_modules is recent (< 1 hour old), skipping install"
      log_success "Dependencies already installed"
      return 0
    fi
  fi

  log_info "Running yarn install..."

  # Try enabling Corepack again just before install
  if command -v corepack &> /dev/null; then
    corepack enable 2>/dev/null || true
  fi

  # Install dependencies (this will also run husky install via postinstall)
  # Try different approaches in order of preference
  if yarn install 2>/dev/null; then
    log_success "Dependencies installed"
  elif yarn install --no-immutable 2>/dev/null; then
    log_success "Dependencies installed (no-immutable mode)"
  else
    log_warning "Yarn install encountered issues, but continuing..."
  fi
}

# Build project
build_project() {
  log_step "Building project"

  # Check if dist directories exist and are recent
  local needs_build=false

  # Check if any package needs building
  for pkg_dir in packages/*/; do
    if [ ! -d "${pkg_dir}dist" ]; then
      needs_build=true
      break
    fi

    # Check if dist is older than src
    if [ -n "$(find "${pkg_dir}src" -type f -newer "${pkg_dir}dist" 2>/dev/null)" ]; then
      needs_build=true
      break
    fi
  done

  if [ "$needs_build" = false ]; then
    log_info "Build artifacts are up to date, skipping build"
    log_success "Project already built"
    return 0
  fi

  log_info "Running yarn build..."

  # Build all packages with TypeScript project references
  if yarn build; then
    log_success "Build complete"
  else
    log_warning "Build encountered errors (may be non-critical)"
  fi
}

# Verify setup
verify_setup() {
  log_step "Verifying setup"

  # Check that key files exist
  local all_good=true

  # Check for workspace packages
  if [ ! -d "packages/rockets-server" ]; then
    log_warning "packages/rockets-server not found"
    all_good=false
  fi

  if [ ! -d "packages/rockets-server-auth" ]; then
    log_warning "packages/rockets-server-auth not found"
    all_good=false
  fi

  # Check for built artifacts
  if [ ! -d "packages/rockets-server/dist" ] && [ ! -d "packages/rockets-server-auth/dist" ]; then
    log_warning "No built artifacts found (dist/ directories missing)"
    all_good=false
  fi

  # Check for node_modules
  if [ ! -d "node_modules" ]; then
    log_warning "node_modules not found"
    all_good=false
  fi

  if [ "$all_good" = true ]; then
    log_success "Setup verified successfully"
  else
    log_warning "Setup verification found some issues (may be non-critical)"
  fi
}

# Display helpful information
display_info() {
  echo ""
  echo "════════════════════════════════════════════════"
  echo -e "  ${GREEN}✓ Rockets Setup Complete!${NC}"
  echo "════════════════════════════════════════════════"
  echo ""
  echo "Available commands:"
  echo "  • yarn build              - Build all packages"
  echo "  • yarn test               - Run unit tests"
  echo "  • yarn test:e2e           - Run end-to-end tests"
  echo "  • yarn lint               - Lint TypeScript files"
  echo "  • yarn lint:fix           - Auto-fix linting issues"
  echo "  • yarn doc                - Generate TypeDoc documentation"
  echo ""
  echo "Example servers:"
  echo "  • cd examples/sample-server && yarn start:dev"
  echo "  • cd examples/sample-server-auth && yarn start:dev"
  echo ""
  echo "Documentation:"
  echo "  • development-guides/     - 13+ comprehensive guides"
  echo "  • AGENTS.md               - Architecture overview"
  echo ""
  echo "Ready to build! 🚀"
  echo ""
}

# Main setup flow
main() {
  echo ""
  echo "════════════════════════════════════════════════"
  echo "  Rockets - Enterprise Auth Framework Setup"
  echo "════════════════════════════════════════════════"
  echo ""

  detect_environment
  setup_claude_memory
  setup_path
  check_tools
  install_dependencies
  build_project
  verify_setup
  display_info
}

# Run main function
main

exit 0
