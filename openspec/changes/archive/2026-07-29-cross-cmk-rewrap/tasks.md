## 1. EventBus Integration

- [x] 1.1 Add optional `eventBus` parameter to `KeyVaultService` constructor (default `NoOpEventBus`), store as `this._eventBus`
- [x] 1.2 Verify existing tests still pass with the new optional parameter (no breaking change)

## 2. Core API — rewrapVault

- [x] 2.1 Implement `rewrapVault(namespace, targetProvider, [options])` in `KeyVaultService`: load VaultDocument via `VaultStore.load()`, skip if same provider (providerId + publicReference both match), unwrap all entries (ACTIVE + ROTATED) with `this._cmkProvider`, verify KCV/binding invariance, re-wrap with target provider, post-rewrap roundtrip verification, update `cmk.provider`/`cmk.id` and `dek.algorithm`/`hmk.algorithm`, increment version, persist via `VaultStore.rotate()`, evict cache entry, emit `lcl.rewrap.namespace.completed`/`lcl.rewrap.namespace.failed` events, return RewrapResult
- [x] 2.2 Support `options.dryRun` — perform full validation but skip VaultStore.rotate() and cache eviction, return RewrapResult with `dryRun: true`
- [x] 2.3 Handle OptimisticLockError from VaultStore.rotate() — wrap in descriptive error message

## 3. Batch API — rewrapAllVaults

- [x] 3.1 Implement `rewrapAllVaults(targetProvider, [options])` in `KeyVaultService`: call `VaultStore.loadAll()`, iterate namespaces invoking `rewrapVault` with try/catch per namespace for error isolation, emit `lcl.rewrap.batch.completed` event, return `RewrapResult[]`

## 4. Unit Tests

- [x] 4.1 Test `rewrapVault` happy path: LOCAL_SYMMETRIC → mock target provider, assert KCV unchanged, algorithm updated, cmk.provider updated, VaultStore.rotate() called
- [x] 4.2 Test `rewrapVault` same-provider no-op: same providerId + publicReference → assert VaultStore.rotate() NOT called, result.skipped === true
- [x] 4.3 Test `rewrapVault` same providerId but different publicReference → assert re-wrap proceeds
- [x] 4.4 Test `rewrapVault` KCV mismatch: corrupt stored KCV → assert Error thrown
- [x] 4.5 Test `rewrapVault` post-rewrap roundtrip failure: mock target unwrap returning wrong bytes → assert Error thrown, vault unchanged
- [x] 4.6 Test `rewrapVault` optimistic lock conflict: mock VaultStore.rotate() throwing OptimisticLockError → assert clean error
- [x] 4.7 Test `rewrapVault` dry-run: assert validation performed but VaultStore.rotate() NOT called, result.dryRun === true
- [x] 4.8 Test `rewrapAllVaults` partial failure: 3 namespaces, middle one fails → assert results contain 2 success + 1 failure
- [x] 4.9 Test event emission: assert `lcl.rewrap.namespace.completed` and `lcl.rewrap.batch.completed` emitted with correct fields
- [x] 4.10 Test cache eviction: after rewrapVault, assert next getActiveKeyPair reloads from VaultStore

## 5. Example Script

- [x] 5.1 Create `examples/cmk-rewrap.js` demonstrating LOCAL → (simulated) cloud provider re-wrap with dry-run and live modes, using InMemoryVaultStore

## 6. Documentation

- [x] 6.1 Create `docs/migration/cross-cmk-provider-migration.md` — architecture diagram (envelope encryption re-wrap flow), prerequisites checklist, provider ID reference table, migration scenarios (LOCAL→Alibaba, LOCAL→Azure, LOCAL→LOCAL key change, cloud same-provider key change), step-by-step procedure (dry-run → live → config switch), transition window guidance, rollback strategy, programmatic API usage, observability events table, post-migration checklist

## 7. Quality Gates

- [x] 7.1 Run `npm run lint` and fix any issues
- [x] 7.2 Run full test suite `npm test` and confirm all pass
