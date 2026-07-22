## ADDED Requirements

### Requirement: Each namespace SHALL have its own vault document and DEK
The system SHALL create a separate vault document for each canonical namespace (e.g., `default.default.User#phone`). Each vault document SHALL contain its own independent DEK/HMAC key pair.

#### Scenario: Different fields of same entity use different vaults
- **WHEN** encrypting `User#phone` and `User#email`
- **THEN** the system SHALL create two separate vault documents
- **AND** each vault SHALL have its own independent DEK and HMAC key

#### Scenario: Same field across entities uses different vaults
- **WHEN** encrypting `User#phone` and `Order#phone`
- **THEN** the system SHALL create two separate vault documents with different DEKs

### Requirement: Vault ID SHALL use canonical namespace with lcl-dek prefix
The vault document `_id` in storage SHALL be `"lcl-dek-" + canonicalNamespace` (e.g., `lcl-dek-default.default.User#phone`). The `lcl-dek-` prefix SHALL be applied by the VaultStore adapter, not by KeyVaultService.

#### Scenario: Vault ID for default namespace
- **WHEN** creating a vault for `Namespace.parse('User#phone')`
- **THEN** the storage `_id` SHALL be `"lcl-dek-default.default.User#phone"`

#### Scenario: Vault ID for full namespace
- **WHEN** creating a vault for `Namespace.of('tenantA', 'app', 'User', 'phone')`
- **THEN** the storage `_id` SHALL be `"lcl-dek-tenantA.app.User#phone"`

### Requirement: VaultStore SHALL apply lcl-dek prefix internally
The `MongoVaultStore` SHALL prepend `VAULT_ID_PREFIX = "lcl-dek-"` to the namespace parameter when constructing the `_id` for storage operations. The `InMemoryVaultStore` SHALL use the namespace string directly as the key without any prefix.

#### Scenario: MongoVaultStore load adds prefix
- **WHEN** `MongoVaultStore.load("default.default.User#phone")` is called
- **THEN** it SHALL query for `_id: "lcl-dek-default.default.User#phone"`

#### Scenario: MongoVaultStore save adds prefix
- **WHEN** `MongoVaultStore.save(doc)` is called with `doc.id = "default.default.User#phone"`
- **THEN** the stored BSON document SHALL have `_id: "lcl-dek-default.default.User#phone"`

#### Scenario: InMemoryVaultStore uses raw namespace
- **WHEN** `InMemoryVaultStore.load("default.default.User#phone")` is called
- **THEN** it SHALL look up the Map key `"default.default.User#phone"` without prefix

### Requirement: Cache SHALL be keyed by canonical namespace
The in-memory cache SHALL use the canonical namespace string as the key. Different namespaces SHALL have independent cache entries even if they share the same entity.

#### Scenario: Different fields have independent cache entries
- **WHEN** `ensureVaultInitialized("default.default.User#phone")` and `ensureVaultInitialized("default.default.User#email")` are called
- **THEN** two independent cache entries SHALL be created

#### Scenario: Same namespace hits cache
- **WHEN** `ensureVaultInitialized("default.default.User#phone")` is called twice
- **THEN** the second call SHALL return from cache without calling `vaultStore.load`
