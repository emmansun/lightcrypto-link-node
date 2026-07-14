## Context

lightcrypto-link-node currently encrypts fields exclusively through the Mongoose plugin (`lclCryptoPlugin`), which hooks into pre-save and post-find middleware. The internal `FieldCryptoService` already provides the low-level encrypt/decrypt primitives, and `KeyVaultService` manages DEK lifecycle — but these are not exposed as a cohesive programmatic API.

The Java LightCrypto-Link ships `ProgrammaticCryptoService` with `encryptValue`, `decryptValue`, and `decryptDocument` methods. Node.js should provide an equivalent surface for full feature parity and cross-language interoperability.

## Goals / Non-Goals

**Goals:**
- Provide `encryptValue(value, entityName, algorithm?)` that produces LCL-compatible sub-documents
- Provide `decryptValue(subDocument)` that recovers plaintext from any LCL sub-document
- Provide `decryptDocument(rawDoc, entityName)` that decrypts all encrypted fields in a raw MongoDB document
- Reuse existing services (`KeyVaultService`, `FieldCryptoService`, `TypeSerializer`, `TypeDeserializer`, `CryptoCodec`) — no new crypto logic
- 100% BSON format compatibility with Java `ProgrammaticCryptoService`

**Non-Goals:**
- Whole-object encryption (`DOC`/`COL`/`MAP` type markers) — not supported in Node.js
- Blind index generation via programmatic API — use the plugin's `fieldName` option instead
- Key rotation through the programmatic API — use `KeyVaultService.rotateDek()` directly

## Decisions

### 1. Constructor design: dependency injection of existing services

**Choice**: Accept `{ keyVaultService, fieldCryptoService, cmkProvider, algorithm }` in constructor.

**Rationale**: Avoids duplicating service logic. `KeyVaultService` already handles DEK resolution, caching, and vault initialization. `FieldCryptoService` already handles sub-document creation/parsing. The new class is a thin orchestration layer.

**Alternatives considered**:
- Standalone class with its own internal services → rejected: duplicates initialization logic, diverges from Java's approach
- Factory method on `KeyVaultService` → rejected: violates single responsibility

### 2. `decryptDocument` needs schema field metadata

**Choice**: Accept `entityName` and use `KeyVaultService`'s existing vault to resolve DEK. For field discovery, accept an explicit `encryptedFields` array (e.g., `['phone', 'ssn']`) rather than requiring Mongoose schema introspection.

**Rationale**: The programmatic API must work without Mongoose. Requiring a Mongoose schema defeats the purpose. The caller knows which fields are encrypted.

### 3. Algorithm parameter: optional with global default

**Choice**: `encryptValue` accepts optional `algorithm` parameter. If omitted, uses the `algorithm` passed to the constructor (defaults to `AES_256_GCM`).

**Rationale**: Matches Java's behavior. Most callers use one algorithm; per-field overrides are available when needed.

### 4. Error handling: throw on invalid input

**Choice**: Throw descriptive errors for null inputs, missing markers (`_e`, `_k`, `_t`, `c`), and unsupported algorithms. Never silently return garbage.

**Rationale**: Security-sensitive API must fail loudly. Matches Java's exception behavior.

## Risks / Trade-offs

| Risk | Mitigation |
|------|-----------|
| DEK cache stale after external rotation | Document that `flushCache()` must be called after rotation. Same risk as existing plugin usage. |
| Caller passes wrong `entityName` | Wrong entity → wrong DEK → KCV mismatch error on decrypt. Clear error message includes entity name. |
| `decryptDocument` mutates input | Document clearly that the method mutates in-place. Return the same reference for chaining. |
| No whole-object support | Clearly documented as non-goal. Java users needing DOC/COL/MAP should use the Java library. |
