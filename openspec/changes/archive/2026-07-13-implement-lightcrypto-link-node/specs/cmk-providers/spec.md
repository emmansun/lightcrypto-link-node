## ADDED Requirements

### Requirement: System SHALL support pluggable CMK providers
The system SHALL provide an abstract CMK provider interface that can be implemented for different key management services.

#### Scenario: Provider interface
- **WHEN** a CMK provider is implemented
- **THEN** it SHALL have methods: `getProviderId()`, `getPublicReference()`, `wrap(plaintextKey)`, `unwrap(wrappedKey)`
- **AND** the `wrap()` method SHALL return `{ ciphertext, algorithm, metadata }` structure
- **AND** the `unwrap()` method SHALL return the raw plaintext key bytes

### Requirement: System SHALL provide Local CMK provider
The system SHALL provide a local CMK provider that uses AES-256-GCM for key wrapping.

#### Scenario: Local CMK initialization
- **WHEN** a local CMK provider is initialized
- **THEN** the CMK SHALL be exactly 32 bytes (256 bits)
- **AND** the provider ID SHALL be `"local-symmetric"`
- **AND** the public reference SHALL be `"local-cmk-sha256:{first 8 hex chars of SHA-256}"`

#### Scenario: Local CMK wrapping
- **WHEN** wrapping a key with local CMK
- **THEN** a 12-byte random IV SHALL be generated
- **AND** the key SHALL be encrypted using AES-256-GCM
- **AND** the output SHALL be `[IV] || [ciphertext + Auth Tag]`

#### Scenario: Local CMK unwrapping
- **WHEN** unwrapping a key
- **THEN** the IV (first 12 bytes) and ciphertext SHALL be extracted
- **AND** the GCM Auth Tag SHALL be verified during decryption

### Requirement: System SHALL provide Azure Key Vault CMK provider
The system SHALL provide an Azure Key Vault provider that uses RSA-OAEP for asymmetric key wrapping.

#### Scenario: Azure provider initialization
- **WHEN** an Azure CMK provider is initialized
- **THEN** it SHALL accept configuration: `keyUrl` (Key Vault URL), `credential` (DefaultAzureCredential)
- **AND** it SHALL initialize a CryptographyClient
- **AND** the provider ID SHALL be `"azure"`

#### Scenario: Azure key wrapping
- **WHEN** wrapping a key with Azure
- **THEN** the system SHALL call Azure Key Vault encrypt endpoint
- **AND** the algorithm SHALL be RSA-OAEP (matches Java)
- **AND** the plaintext SHALL be sent to Azure

#### Scenario: Azure key unwrapping
- **WHEN** unwrapping a key
- **THEN** the system SHALL call Azure Key Vault decrypt endpoint
- **AND** the ciphertext SHALL be sent to Azure

### Requirement: System SHALL provide Alibaba Cloud KMS provider
The system SHALL provide an Alibaba Cloud KMS provider for China compliance.

#### Scenario: Alibaba provider initialization
- **WHEN** an Alibaba CMK provider is initialized
- **THEN** it SHALL accept configuration: `keyId`, `region`, `endpoint`, `accessKeyId`, `accessKeySecret`
- **AND** it SHALL initialize the Alibaba KMS client
- **AND** the provider ID SHALL be `"alibaba"`

#### Scenario: Alibaba key wrapping
- **WHEN** wrapping a key with Alibaba KMS
- **THEN** the system SHALL call Alibaba Encrypt API
- **AND** the plaintext SHALL be Base64-encoded before sending
- **AND** the ciphertext SHALL be Base64-decoded before returning

#### Scenario: Alibaba key unwrapping
- **WHEN** unwrapping a key
- **THEN** the system SHALL call Alibaba Decrypt API
- **AND** the ciphertext SHALL be Base64-encoded before sending
- **AND** the plaintext SHALL be Base64-decoded before returning

### Requirement: CMK providers SHALL support metadata for CMK version tracking
The system SHALL allow CMK providers to include version metadata in wrapped keys.

#### Scenario: CMK version metadata
- **WHEN** wrapping a key
- **THEN** the provider MAY include `metadata: { cmkVersion: "1" }`
- **AND** this metadata SHALL be stored in `keys[].dek.cmkVersion` and `keys[].hmk.cmkVersion`
- **AND** during unwrapping, this metadata SHALL be passed to the CMK provider

### Requirement: CMK provider SHALL be optional dependency
Cloud KMS providers (Azure, Alibaba) SHALL be optional dependencies to keep core library lightweight.

#### Scenario: Lazy provider loading
- **WHEN** a CMK provider is not configured
- **THEN** the system SHALL NOT require the cloud SDK to be installed
- **AND** the provider class SHALL NOT be imported unless explicitly requested
