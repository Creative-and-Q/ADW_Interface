# AIDeveloper Server

## Overview
The AIDeveloper Server is an automated development workflow system that supports resumable workflows with secure checkpointing.

## New Features
- **Automatic Workflow Resumption**: On server restart, workflows are automatically resumed from the last saved checkpoint, ensuring continuity.
- **Secure Checkpointing**: Checkpoints are encrypted using AES-256-GCM, serialized safely with serialize-javascript, and validated for integrity with SHA-256 checksums.
- **Access Controls**: Checkpoint files have owner-only permissions (600), and workflow IDs are sanitized to prevent path traversal.
- **Configuration**: Encryption keys are managed via environment variables for security.

## Setup
1. Install dependencies: `npm install`
2. Set environment variable: `CHECKPOINT_ENCRYPTION_KEY=<64-char hex string>`
3. Run: `npm start`

## Security
- Encryption prevents unauthorized access to sensitive workflow data.
- Validation and sanitization mitigate injection and path traversal risks.
- File permissions restrict access to checkpoint files.

## Usage
Workflows are managed internally; no user-facing changes. On startup, logs will indicate resumption progress.