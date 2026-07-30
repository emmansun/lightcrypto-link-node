## Context

LightCrypto-Link Node uses envelope encryption: a CMK (via `CmkProvider` SPI) wraps/unwraps DEK and HMAC keys stored in `VaultDocument`. Business data is encrypted with the DEK, never directly with the CMK. Switching CMK providers only requires re-wrapping vault key material — business data, wire format, and blind index values remain untouched.

Current state:
- `KeyVaultService` supports vault initialization (`ensureVaultInitialized`) and DEK rotation (`rotateDek`), but has no re-wrap capability.
- `VaultDocument` stores `cmk.provider` and `cmk.id` at vault level; each `KeyEntry` stores `dek.algorithm` / `hmk.algorithm`.
- `VaultStore.loadAll()` exists for bulk loading all namespaces.
- `VaultStore.rotate()` provides optimistic-locking CAS for safe concurrent updates.
- `EventBus` SPI with `LclEvent` builder and `NoOpEventBus` default are available.
- `CryptoCodec` provides `computeKcv()` and `computeBinding()` for integrity checks.
- The Java SDK shipped `cross-cmk-rewrap` in v1.2.0; this design ports the core API to Node.js idioms.

## Goals / Non-Goals

**Goals:**
- Provide a safe, atomic, per-namespace re-wrap API that preserves key integrity (KCV/binding invariance).
- Re-wrap ALL key entries (ACTIVE + ROTATED) since historical DEK versions are needed for decryption.
- Support dry-run mode for validation without mutation.
- Emit observability events (`lcl.rewrap.*`) via EventBus.
- Maintain cross-language compatibility with Java's vault document format.

**Non-Goals:**
- Per-entry provider tracking (each KeyEntry remembering its own CMK) — deferred to future crypto agility phase.
- Dual-provider concurrent read path (provider registry dispatching unwrap by entry) — not needed for vault-level migration.
- Automatic data re-encryption or DEK material rotation — that is the existing `rotateDek()` path.
- Zero-downtime live migration — brief write-pause is acceptable.
- Spring-style CommandLineRunner / configuration properties — Node.js callers pass provider instances directly.
- Three-level target provider resolution (bean name → providerId+ref → providerId) — no DI container in Node.js.

## Decisions

### D1: Vault-level atomic re-wrap (not per-entry gradual)

All KeyEntries in a VaultDocument are re-wrapped in a single atomic operation. The `cmk.provider` and `cmk.id` fields are updated to the new provider.

**Rationale**: Simplicity. The read path (`_verifyAndLoadKeys`) uses a single `CmkProvider` instance to unwrap all entries. Supporting mixed providers per entry would require a provider registry and per-entry dispatch — significant complexity for a rare use case. Aligned with Java D1.

### D2: Reuse VaultStore.rotate() for persistence

The re-wrap operation builds an updated VaultDocument (new wrapped keys, updated algorithm, updated cmk fields, incremented version) and persists via `VaultStore.rotate()` which enforces optimistic locking.

**Rationale**: Reuses existing concurrency safety already proven by `rotateDek()`. If another node rotates concurrently, the operation fails fast with a clear error rather than corrupting key material. Aligned with Java D2.

### D3: KCV invariance as correctness gate

After unwrapping with the current provider, the system SHALL recompute KCV and binding and verify they match stored values. After re-wrapping, a verification unwrap with the target provider SHALL confirm roundtrip correctness.

**Rationale**: Detects misconfigured target provider (wrong key, wrong algorithm) before committing. Prevents silent key corruption. Aligned with Java D3.

### D4: Optional EventBus injection with NoOp default

`KeyVaultService` constructor gains an optional `eventBus` parameter (default: `NoOpEventBus`). Re-wrap operations emit events internally.

**Rationale**: Backward compatible — existing callers unaffected. Consistent with Java where KeyVaultService emits events internally. Forward-looking — `rotateDek` and other operations can adopt events later without signature changes.

**Alternative considered**: External event emission by caller. Rejected — observability is a service-layer concern; pushing it to callers fragments the pattern.

### D5: Same-provider skip uses providerId + publicReference

The `rewrapVault` same-provider check compares BOTH `targetProvider.getProviderId()` AND `targetProvider.getPublicReference()` against stored `cmk.provider` and `cmk.id`. Only when both match is the operation skipped.

**Rationale**: Same-type key rotation (e.g., Azure key A → Azure key B) shares the same providerId. Without publicReference comparison, the re-wrap would be incorrectly skipped. Aligned with Java D6.

### D6: Dry-run as options parameter

`rewrapVault(namespace, targetProvider, { dryRun: true })` performs full validation (load, unwrap, KCV check, canary wrap/unwrap with target) but does NOT persist. Returns a RewrapResult with `dryRun: true`.

**Rationale**: Node.js idiom — options object instead of Spring configuration properties. Keeps the API surface minimal while providing operational safety.

### D7: No runner class — example script instead

Instead of a Java-style `CmkProviderRewrapRunner` CommandLineRunner, the operational tooling is an `examples/cmk-rewrap.js` script demonstrating the migration flow.

**Rationale**: Node.js has no Spring DI / auto-configuration. Users compose providers programmatically. An example script is the idiomatic Node.js equivalent and aligns with the existing `examples/` pattern in this project.

## Risks / Trade-offs

| Risk | Mitigation |
|------|-----------|
| Old CMK unavailable during re-wrap → unwrap fails | Document prerequisite: current provider must remain configured and reachable. The API uses `this._cmkProvider` (the injected current provider) for unwrap. |
| New CMK misconfigured → re-wrap produces garbage | D3 verification gate: post-rewrap unwrap + KCV check before persist. Operation is atomic per namespace — failure leaves vault unchanged. |
| Concurrent rotation during re-wrap | Optimistic locking via `VaultStore.rotate()` — concurrent modification causes clean failure, no corruption. |
| Large namespace count → extended write-pause | `rewrapAllVaults` processes sequentially with per-namespace error isolation. Each re-wrap is a local crypto operation + one DB write (milliseconds). |
| Rollback needed after partial migration | Vaults are independent. Un-migrated namespaces still use old provider. Rollback = revert config to old provider. Already-migrated namespaces need reverse re-wrap. |
