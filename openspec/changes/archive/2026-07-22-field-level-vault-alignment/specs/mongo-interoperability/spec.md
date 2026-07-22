## MODIFIED Requirements

### Requirement: Key vault format SHALL match Java __lcl_keyvault collection
The vault document structure SHALL be compatible with Java's `VaultDocument` record. The `_id` SHALL be `"lcl-dek-{canonical-namespace}"` where the canonical namespace is the full four-segment form (e.g., `lcl-dek-default.default.User#phone`).

#### Scenario: Vault document _id format
- **WHEN** creating a vault document for `User#phone`
- **THEN** the `_id` SHALL be `"lcl-dek-default.default.User#phone"`
- **AND** Java's `KeyVaultService` SHALL be able to load it via `vaultStore.load("default.default.User#phone")`

#### Scenario: Per-field vault interoperability
- **WHEN** Node.js encrypts `User.phone` creating vault `lcl-dek-default.default.User#phone`
- **AND** Java encrypts `User.email` creating vault `lcl-dek-default.default.User#email`
- **THEN** both vaults SHALL coexist in the same `__lcl_keyvault` collection
- **AND** each side SHALL only use its own vault's DEK

#### Scenario: Same field vault sharing
- **WHEN** Node.js creates vault `lcl-dek-default.default.User#phone`
- **THEN** Java SHALL be able to load and use the same vault document for `User#phone` encryption/decryption

### Requirement: Per-field DEK rotation SHALL be interoperable
The `rotateDek(namespace)` method SHALL produce vault documents that Java can parse and use, with per-namespace rotation independence.

#### Scenario: Node.js rotation, Java usage
- **WHEN** Node.js rotates DEK for `default.default.User#phone`
- **THEN** the updated vault document SHALL be parseable by Java's `KeyVaultService`
- **AND** Java SHALL see the new active kid and rotated historical keys

#### Scenario: Java rotation, Node.js usage
- **WHEN** Java rotates DEK for `default.default.User#phone`
- **THEN** Node.js `ensureVaultInitialized("default.default.User#phone")` SHALL load the rotated vault
- **AND** `getActiveKid("default.default.User#phone")` SHALL return the new kid

### Requirement: Vault document version field SHALL be numeric
The vault document `v` field SHALL be a monotonically increasing integer, matching Java's `long version` field.

#### Scenario: Version numbering
- **WHEN** a new vault is created
- **THEN** `v` SHALL be `1`
- **WHEN** the vault is rotated
- **THEN** `v` SHALL be incremented by 1
