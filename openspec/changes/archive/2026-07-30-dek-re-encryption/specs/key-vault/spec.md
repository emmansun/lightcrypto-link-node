## ADDED Requirements

### Requirement: RETIRED key status
The vault document key entries SHALL support a `RETIRED` status indicating the key is no longer needed for any runtime operation and can be safely deleted.

#### Scenario: Key status lifecycle
- **WHEN** a key entry transitions through its lifecycle
- **THEN** the status SHALL follow: `ACTIVE → ROTATED → RETIRED`
- **AND** `RETIRED` SHALL only be set from `ROTATED` (never directly from `ACTIVE`)

#### Scenario: RETIRED keys not used for decryption
- **WHEN** `getDekByVersion(namespace, dekVersion)` resolves to a key entry with status `RETIRED`
- **THEN** the system SHALL throw `KeyResolutionError` indicating the key has been retired

### Requirement: markKeysRetired operation
The system SHALL provide `KeyVaultService.markKeysRetired(namespace, kids)` to transition specified ROTATED key entries to RETIRED status.

#### Scenario: Mark specific kids as retired
- **WHEN** `markKeysRetired(namespace, ['v1-abcd', 'v2-efgh'])` is invoked
- **THEN** the system SHALL set status to `RETIRED` for matching key entries that are currently `ROTATED`
- **AND** persist the vault document atomically via `VaultStore.rotate()`

#### Scenario: ACTIVE keys cannot be retired
- **WHEN** `markKeysRetired` targets a kid that is currently `ACTIVE`
- **THEN** the system SHALL skip that entry without error (ACTIVE keys cannot be retired)

### Requirement: pruneRetiredKeys operation
The system SHALL provide `KeyVaultService.pruneRetiredKeys(namespace)` to permanently remove all RETIRED key entries from the vault document.

#### Scenario: Remove retired entries
- **WHEN** `pruneRetiredKeys(namespace)` is invoked and the vault has 2 RETIRED entries
- **THEN** the system SHALL remove those entries from `keys[]` and persist atomically
- **AND** the vault document version SHALL be incremented

#### Scenario: No retired entries is a no-op
- **WHEN** `pruneRetiredKeys(namespace)` is invoked and no entries have RETIRED status
- **THEN** the system SHALL return without modification
