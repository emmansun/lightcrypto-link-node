## MODIFIED Requirements

### Requirement: CMK providers SHALL support metadata for CMK version tracking
The system SHALL allow CMK providers to include version metadata in wrapped keys. Cloud KMS providers (Azure Key Vault, Alibaba Cloud KMS) SHALL auto-resolve `cmkVersion` from the KMS API when not explicitly configured, ensuring the metadata always contains a valid version identifier.

#### Scenario: CMK version metadata with explicit config
- **WHEN** wrapping a key and `cmkVersion` is explicitly provided in configuration
- **THEN** the provider SHALL use the configured `cmkVersion` value in wrap metadata
- **AND** this metadata SHALL be stored in `keys[].dek.cmkVersion` and `keys[].hmk.cmkVersion`

#### Scenario: CMK version metadata auto-resolved
- **WHEN** wrapping a key and `cmkVersion` is NOT explicitly provided
- **THEN** the provider SHALL query the KMS API to resolve the current key version
- **AND** the resolved version SHALL be used in wrap metadata
- **AND** the resolved version SHALL be cached for subsequent operations

#### Scenario: CMK version during unwrapping
- **WHEN** unwrapping a key
- **THEN** the provider SHALL read `cmkVersion` from the stored metadata (not resolve the current version)
- **AND** the stored `cmkVersion` SHALL be used to decrypt with the correct key version

## ADDED Requirements

### Requirement: Azure Key Vault provider SHALL auto-resolve key metadata
When `cmkVersion` or `publicKeyPem` are not explicitly configured, the Azure Key Vault provider SHALL resolve them by querying `KeyClient.getKey(keyName)` after initializing the KeyClient.

#### Scenario: Auto-resolve cmkVersion for Azure Key Vault
- **WHEN** `config.cmkVersion` is not provided and `wrap()` is called
- **THEN** the provider SHALL call `keyClient.getKey(keyName)` to fetch the latest key
- **AND** SHALL set `_cmkVersion` to `key.properties.version`
- **AND** SHALL cache the resolved version for subsequent calls

#### Scenario: Auto-resolve publicKeyPem for Azure Key Vault
- **WHEN** `config.publicKeyPem` is not provided and `wrap()` is called
- **THEN** the provider SHALL call `keyClient.getKey(keyName)` (same call as version resolution)
- **AND** SHALL extract the JWK material (`kty`, `n`, `e`) from the returned KeyVaultKey
- **AND** SHALL build a PEM public key using `crypto.createPublicKey({ key: { kty, n, e }, format: 'jwk' })`
- **AND** SHALL export it as PEM and cache it as `_publicKeyPem`

#### Scenario: Auto-resolve uses single API call for both values
- **WHEN** both `cmkVersion` and `publicKeyPem` need resolution
- **THEN** the provider SHALL resolve both from a single `getKey()` call
- **AND** SHALL NOT make duplicate API calls

#### Scenario: Explicit config takes precedence over auto-resolution
- **WHEN** `config.cmkVersion` or `config.publicKeyPem` is explicitly provided
- **THEN** the provider SHALL use the configured values
- **AND** SHALL NOT query the KMS API for the explicitly provided values

### Requirement: Alibaba Cloud KMS provider SHALL auto-resolve key metadata
When `cmkVersion` or `publicKeyPem` are not explicitly configured, the Alibaba Cloud KMS provider SHALL resolve them using `ListKeyVersions` and `GetPublicKey` APIs after initializing the KMS client.

#### Scenario: Auto-resolve cmkVersion for Alibaba asymmetric key
- **WHEN** `config.cmkVersion` is not provided, `keyType` is `asymmetric`, and `wrap()` is called
- **THEN** the provider SHALL call `ListKeyVersions(keyId, pageNumber=1, pageSize=1)` to get the latest version
- **AND** SHALL set `_cmkVersion` to the first result's `keyVersionId`
- **AND** SHALL cache the resolved version for subsequent calls

#### Scenario: Auto-resolve publicKeyPem for Alibaba asymmetric key
- **WHEN** `config.publicKeyPem` is not provided, `keyType` is `asymmetric`, and `wrap()` is called
- **THEN** the provider SHALL first resolve `keyVersionId` (via ListKeyVersions or from config)
- **AND** SHALL call `GetPublicKey(keyId, keyVersionId)` to get the PEM
- **AND** SHALL cache the PEM as `_publicKeyPem`

#### Scenario: No public key resolution for symmetric keys
- **WHEN** `keyType` is `symmetric`
- **THEN** the provider SHALL NOT attempt to resolve `publicKeyPem` (symmetric keys don't use public key encryption)
- **AND** `cmkVersion` resolution is optional for symmetric keys (Encrypt API does not require it)

#### Scenario: Explicit config takes precedence for Alibaba KMS
- **WHEN** `config.cmkVersion` or `config.publicKeyPem` is explicitly provided
- **THEN** the provider SHALL use the configured values
- **AND** SHALL NOT query the KMS API for the explicitly provided values

### Requirement: Auto-resolved metadata SHALL be cached for provider lifetime
Once resolved from the KMS API, `cmkVersion` and `publicKeyPem` SHALL be cached on the provider instance and reused for all subsequent operations.

#### Scenario: Cached metadata reused
- **WHEN** `wrap()` is called multiple times on the same provider instance
- **THEN** the KMS metadata resolution API SHALL only be called once
- **AND** subsequent `wrap()` calls SHALL use the cached values

#### Scenario: Fresh metadata on new provider instance
- **WHEN** a new provider instance is created (e.g., after CMK rotation)
- **THEN** the new instance SHALL resolve fresh metadata from the KMS API
- **AND** SHALL NOT share cached metadata with other instances
