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