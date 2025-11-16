# Changelog

## [Unreleased]
- **Added**: Automatic resumption of workflows from encrypted checkpoints on server startup.
- **Security**: Replaced eval() with serialize-javascript for safe deserialization.
- **Security**: Implemented AES-256-GCM encryption for checkpoint files.
- **Security**: Added workflow ID validation and sanitization to prevent path traversal.
- **Security**: Introduced SHA-256 checksums for data integrity checks.
- **Security**: Set file permissions to owner-only (600) for checkpoints.
- **Added**: New utilities for encryption (`checkpoint-encryption.ts`), validation (`workflow-validation.ts`), and config (`checkpoint-config.ts`).
- **Modified**: Updated CheckpointManager, WorkflowResumer, Server, and WorkflowManager for secure operations.
- **Tests**: Added unit and integration tests for resumption and security features.

## Previous Versions
- Initial implementation with basic checkpointing (replaced due to security issues).

---

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- ChainBuilder component for workflow orchestration across multiple modules
- EventBus for decoupled inter-module communication
- ModuleRegistry for dynamic module registration and discovery
- ModuleAdapter base class with standardized interface
- ChainStateManager for managing execution state with rollback capabilities
- ChainExecutor for orchestrating chain execution
- Chain serialization and validation utilities
- React hooks: useChainBuilder and useChainExecution
- Comprehensive TypeScript type definitions
- Security-focused input validation and sanitization
- Rate limiting for event publishing

### Security
- Implemented Zod schema validation for all inputs
- Added authentication checks for module registration
- Enhanced error handling and logging
- Sanitized all user inputs to prevent XSS
- Encrypted sensitive data storage

### Changed
- Updated store integration for ChainStateManager
- Enhanced package.json with additional dependencies
- Updated tsconfig.json for better type checking

### Fixed
- Resolved duplicate useChainBuilder implementations
- Improved error propagation in EventBus
- Added memory leak prevention in state listeners

### Technical Debt
- Completed placeholder implementations in ChainExecutor
- Consolidated type definitions
- Improved test coverage for security scenarios
