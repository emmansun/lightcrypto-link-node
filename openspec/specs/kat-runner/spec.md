## ADDED Requirements

### Requirement: KAT encryption vector verification
The system SHALL provide a `KatRunner` that verifies encryption correctness using known-answer test vectors for each supported algorithm: AES-256-GCM, AES-256-CBC, SM4-CBC.

#### Scenario: Encryption KAT passes
- **WHEN** the encryptor produces ciphertext matching the expected value from the golden vector
- **THEN** the KAT for that algorithm SHALL be marked as passed

#### Scenario: Encryption KAT fails
- **WHEN** the encryptor produces ciphertext that does NOT match the expected value
- **THEN** the KAT SHALL return failure with message identifying the algorithm and vector ID

#### Scenario: KAT vector loading
- **WHEN** KatRunner executes
- **THEN** it SHALL load vectors from `src/bootstrap/kat/aes-256-gcm.json`, `aes-256-cbc.json`, `sm4-cbc.json`
- **AND** use the first vector from each file for deterministic verification
- **AND** compute AAD via `WireFormatEncoder.buildAad(algorithm, namespace, dekVersion)`

### Requirement: KAT blind index verification
The system SHALL verify blind index computation using HMAC-SHA256 golden vectors.

#### Scenario: Blind index KAT passes
- **WHEN** `BlindIndexEngine.computeBlindIndex(namespace, fieldName, plaintext)` matches the expected base64url value
- **THEN** the blind index KAT SHALL be marked as passed

#### Scenario: Blind index KAT fails
- **WHEN** the computed blind index does NOT match
- **THEN** the KAT SHALL return failure with vector ID

### Requirement: KAT KCV verification
The system SHALL verify Key Check Value computation using golden vectors for DEK_KCV, HMAC_KCV, and BINDING types.

#### Scenario: KCV KAT passes
- **WHEN** all KCV computations match expected values
- **THEN** the KCV KAT SHALL be marked as passed

#### Scenario: KCV KAT fails
- **WHEN** any KCV computation does NOT match
- **THEN** the KAT SHALL return failure listing all mismatched vector IDs

### Requirement: KAT timing budget
The system SHALL enforce advisory timing budgets:
- Total KAT budget: 200ms
- Per-primitive budget: 30ms

#### Scenario: Budget exceeded
- **WHEN** total KAT execution exceeds 200ms or a primitive exceeds 30ms
- **THEN** the result SHALL include an advisory warning but SHALL NOT fail the check

### Requirement: KatRunner as BootstrapCheck
`KatRunner` SHALL implement the BootstrapCheck interface: `async check(context) → PhaseResult`.

#### Scenario: All KATs pass
- **WHEN** all encryption, blind index, and KCV vectors verify correctly
- **THEN** KatRunner SHALL return `PhaseResult.success('BOOT-4 KAT', durationMs)`

#### Scenario: Any KAT fails
- **WHEN** any vector verification fails
- **THEN** KatRunner SHALL return `PhaseResult.failure('BOOT-4 KAT', durationMs, joinedErrors)`

### Requirement: KAT results accessible for diagnostics
`KatRunner` SHALL expose `getLastResults()` returning a map of algorithm name → `{ algorithm, passed, durationMs, error }`.
