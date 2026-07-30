## Why

Users who start with `local-symmetric` CMK (development/evaluation) need a supported path to migrate to a production cloud KMS (Azure Key Vault, Alibaba Cloud KMS) — or between cloud providers. The envelope encryption architecture cleanly separates CMK (wraps DEK) from DEK (encrypts data), making migration possible by re-wrapping vault key material alone without re-encrypting business data. However, no API exists today to perform this re-wrap; users would have to manually manipulate vault documents, risking key loss or integrity violations. The Java SDK already ships this capability (v1.2.0); the Node.js SDK must reach parity.

## What Changes

- Add `KeyVaultService.rewrapVault(namespace, targetProvider, [options])` API that unwraps all key entries (ACTIVE + ROTATED) with the current provider, re-wraps with the target provider, verifies KCV/binding invariance, performs post-rewrap roundtrip verification, and persists atomically via `VaultStore.rotate()` with optimistic locking.
- Add `KeyVaultService.rewrapAllVaults(targetProvider, [options])` convenience method iterating all namespaces via `VaultStore.loadAll()` with per-namespace error isolation.
- Add optional `eventBus` injection to `KeyVaultService` constructor (default `NoOpEventBus`) for `lcl.rewrap.*` event emission.
- Support `dryRun` option for validation without mutation.
- Add `examples/cmk-rewrap.js` demonstrating LOCAL → cloud provider migration flow.
- Add `docs/migration/cross-cmk-provider-migration.md` migration guide covering architecture, prerequisites, step-by-step procedure (dry-run → live → config switch), scenarios, rollback, and checklist.
- Emit `lcl.rewrap.namespace.completed`, `lcl.rewrap.namespace.failed`, and `lcl.rewrap.batch.completed` events via EventBus.

## Capabilities

### New Capabilities

- `cmk-rewrap`: Programmatic API for re-wrapping vault DEK/HMAC keys under a different CMK provider without data re-encryption, including dry-run mode, integrity verification, and observability events.

### Modified Capabilities

- `key-vault`: Add `rewrapVault` and `rewrapAllVaults` operations to KeyVaultService, extending its lifecycle management beyond initialization and rotation. Add optional `eventBus` constructor parameter.

## Impact

- **Code**: `src/service/KeyVaultService.js` (new methods + eventBus injection), `examples/cmk-rewrap.js` (new file), `docs/migration/cross-cmk-provider-migration.md` (new file).
- **APIs**: New public methods on `KeyVaultService`; new optional constructor parameter `eventBus`.
- **Dependencies**: No new external dependencies.
- **Data**: VaultDocument `cmk.provider`, `cmk.id`, and `keys[].dek/hmk.wrapped/algorithm` fields are updated in-place. No schema change. Business data and blind index values remain untouched.
- **Compatibility**: Fully backward compatible — `eventBus` is optional with NoOp default; existing callers unaffected.
