# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

n8n is a workflow automation platform built as a monorepo using pnpm workspaces. The codebase is split into multiple packages that handle different aspects of the application: core workflow execution, frontend UI, nodes, CLI, and various utilities.

## Common Development Commands

### Setup
```bash
# Install dependencies (use pnpm, not npm)
pnpm install

# Initial setup with corepack
corepack enable
corepack prepare --activate
```

### Development
```bash
# Start development server (excludes design system, chat, and task runner)
pnpm dev

# Start backend only
pnpm dev:be

# Start frontend only  
pnpm dev:fe

# Start AI/LangChain development
pnpm dev:ai
```

### Building
```bash
# Build all packages
pnpm build

# Build specific parts
pnpm build:backend
pnpm build:frontend
pnpm build:nodes
```

### Testing
```bash
# Run all tests
pnpm test

# Run backend tests only
pnpm test:backend

# Run frontend tests only
pnpm test:frontend

# Run node tests only
pnpm test:nodes

# Run E2E tests
pnpm dev:e2e
```

### Linting & Formatting
```bash
# Lint all code
pnpm lint

# Auto-fix linting issues
pnpm lintfix

# Format code
pnpm format

# Check formatting
pnpm format:check

# Type checking
pnpm typecheck
```

### Single Package Development
```bash
# Test a specific package
pnpm --filter=package-name test

# Build a specific package
pnpm --filter=package-name build
```

## Architecture Overview

### Core Packages
- **`packages/cli`** - Main CLI application that runs the n8n server (backend)
- **`packages/core`** - Core workflow execution engine and webhook handling
- **`packages/workflow`** - Workflow interfaces and types shared between frontend and backend
- **`packages/nodes-base`** - Base n8n nodes (400+ integrations)
- **`packages/@n8n/nodes-langchain`** - LangChain/AI nodes

### Frontend Packages
- **`packages/frontend/editor-ui`** - Main Vue.js workflow editor UI
- **`packages/frontend/@n8n/design-system`** - Vue component library

### Infrastructure & Utilities
- **`packages/@n8n/db`** - Database layer with TypeORM
- **`packages/@n8n/api-types`** - API type definitions
- **`packages/@n8n/permissions`** - Permission system
- **`packages/@n8n/config`** - Configuration management
- **`packages/@n8n/di`** - Dependency injection

### Testing
- **`cypress/`** - E2E tests using Cypress
- **`packages/testing/`** - Testing utilities and containers

## Key Technical Details

### Package Manager
- Uses **pnpm** with workspaces (NOT npm)
- Monorepo managed by **Turbo** for efficient builds
- Node.js 22.16+ required
- pnpm 10.2+ required

### Build System
- **Turbo** for build orchestration and caching
- **TypeScript** throughout the codebase
- **Jest** for unit testing
- **Cypress** for E2E testing
- **Biome** for linting and formatting (replacing ESLint/Prettier)

### Database
- **TypeORM** for database operations
- Supports PostgreSQL, MySQL, SQLite

### Pre-commit Hooks
- **Lefthook** manages pre-commit hooks
- Automatically runs Biome formatting and linting
- Formats Vue, YAML, Markdown, CSS files with Prettier

### Starting the Application
```bash
# Start n8n server
pnpm start

# Start with tunnel for webhook testing
pnpm start:tunnel

# Start webhook process
pnpm webhook

# Start worker process
pnpm worker
```

## Development Workflow

1. **Core changes** - Contact n8n team before making changes to `packages/core`
2. **New nodes** - Use `packages/node-dev` CLI to scaffold new nodes
3. **Frontend changes** - Work in `packages/frontend/editor-ui`
4. **Testing** - Always run relevant tests before committing
5. **Linting** - Pre-commit hooks will automatically format code

## Package Dependencies

The build system uses Turbo to manage dependencies between packages. Key dependency chains:
- Core packages must build before CLI
- Design system must build before editor UI
- TypeScript configs are shared across packages
- API types are used by both frontend and backend

## Important Notes

- Never use `npm install` - the repo blocks npm usage
- Use `pnpm --filter=package-name` to run commands on specific packages
- The development server excludes design system, chat, and task runner by default
- Pre-commit hooks automatically format code - don't bypass them
- Coverage reports are generated in CI with `COVERAGE_ENABLED=true`