# ADR 001: Secure Checkpointing with Encryption and Safe Serialization

## Status
Accepted

## Context
The previous implementation used eval() for deserialization, leading to code injection risks, and lacked encryption, exposing sensitive data. Path traversal and access control issues were also present.

## Decision
- Use serialize-javascript for safe serialization/deserialization instead of eval().
- Encrypt checkpoints with AES-256-GCM using keys from environment variables.
- Validate and sanitize workflow IDs to alphanumeric + hyphens/underscores.
- Add SHA-256 checksums for integrity.
- Set file permissions to 600 and store in restricted directories.

## Consequences
- Mitigates OWASP injection, cryptographic failures, and access control risks.
- Increases startup time slightly due to encryption/decryption but ensures security.
- Requires environment variable setup for keys.

## Alternatives Considered
- No encryption: Rejected for data exposure risks.
- JSON.stringify/parse: Rejected as it doesn't handle functions safely.