## ADDED Requirements

### Requirement: System SHALL support multi-source configuration loading
The system SHALL load configuration from multiple sources with a defined precedence hierarchy.

#### Scenario: Configuration source precedence
- **WHEN** configuration is loaded
- **THEN** the system SHALL check sources in this order (highest to lowest priority):
  1. Environment variables (e.g., `LCL_CMK_KEY`, `LCL_MONGODB_URI`)
  2. Secret management systems (Kubernetes Secrets, AWS Secrets Manager, Azure Key Vault Secrets, HashiCorp Vault)
  3. Remote configuration services (Spring Cloud Config, Consul, etcd)
  4. Local configuration files (`.env.local`, `.env.production`, `config/lcl.json`)
  5. Application defaults (hardcoded safe defaults)
- **AND** higher-priority sources SHALL override lower-priority values

#### Scenario: Environment variable configuration
- **WHEN** `LCL_CMK_KEY` environment variable is set
- **THEN** the system SHALL use it as the CMK key (for LocalCmkProvider)
- **AND** it SHALL be a 64-character hex string (32 bytes)
- **WHEN** `LCL_MONGODB_URI` is set
- **THEN** the system SHALL use it for `__lcl_keyvault` collection connection

### Requirement: System SHALL support secret management integration
The system SHALL integrate with popular secret management systems for secure credential storage.

#### Scenario: Kubernetes Secrets integration
- **WHEN** running in Kubernetes
- **THEN** the system SHALL read secrets from mounted volume (e.g., `/var/run/secrets/lightcrypto-link/`)
- **AND** it SHALL support `cmk-key`, `mongodb-uri`, and `azure-credentials` secret files

#### Scenario: AWS Secrets Manager integration
- **WHEN** `LCL_AWS_SECRET_ID` is configured
- **THEN** the system SHALL fetch CMK and MongoDB credentials from AWS Secrets Manager
- **AND** the secret format SHALL be JSON with keys: `cmkKey`, `mongodbUri`, `azureKeyUrl`

#### Scenario: Azure Key Vault Secrets integration
- **WHEN** `LCL_AZURE_SECRET_URL` is configured
- **THEN** the system SHALL fetch secrets from Azure Key Vault
- **AND** it SHALL use DefaultAzureCredential for authentication

#### Scenario: HashiCorp Vault integration
- **WHEN** `LCL_VAULT_ADDR` and `LCL_VAULT_TOKEN` are configured
- **THEN** the system SHALL fetch secrets from HashiCorp Vault
- **AND** the secret path SHALL be configurable (default: `secret/data/lightcrypto-link`)

### Requirement: System SHALL validate configuration on startup
The system SHALL validate all required configuration values before initialization.

#### Scenario: CMK validation
- **WHEN** LocalCmkProvider is used
- **THEN** the CMK MUST be exactly 64 hex characters (32 bytes)
- **AND** if invalid, a ConfigurationException SHALL be thrown with clear error message
- **AND** the error SHALL suggest checking `LCL_CMK_KEY` environment variable

#### Scenario: MongoDB URI validation
- **WHEN** MongoDB URI is provided
- **THEN** it SHALL be validated as a valid MongoDB connection string
- **AND** if invalid, a ConfigurationException SHALL be thrown

#### Scenario: Required configuration check
- **WHEN** required configuration is missing
- **THEN** the system SHALL throw ConfigurationException listing all missing values
- **AND** the error message SHALL include which configuration sources were checked

### Requirement: System SHALL support configuration file loading
The system SHALL load configuration from JSON and .env files.

#### Scenario: JSON configuration file
- **WHEN** `config/lcl.json` exists
- **THEN** the system SHALL load it and merge with other sources
- **AND** the file format SHALL be:
  ```json
  {
    "lcl": {
      "crypto": {
        "cmk": "64 hex chars",
        "algorithm": "AES_256_GCM"
      },
      "mongodb": {
        "uri": "mongodb://..."
      },
      "cmk": {
        "provider": "local-symmetric",
        "azure": {
          "keyUrl": "https://...",
          "credential": "default"
        }
      }
    }
  }
  ```

#### Scenario: .env file loading
- **WHEN** `.env.local` or `.env.production` exists
- **THEN** the system SHALL load environment variables from the file
- **AND** it SHALL use the `dotenv` package (optional dependency)

### Requirement: System SHALL support runtime configuration refresh
The system SHALL allow configuration to be reloaded without restarting the application.

#### Scenario: Configuration reload
- **WHEN** `config.reload()` is called
- **THEN** the system SHALL re-read configuration from all sources
- **AND** if CMK changed, the DEK cache SHALL be flushed
- **AND** if MongoDB URI changed, the vault connection SHALL be re-established

#### Scenario: Configuration change detection
- **WHEN** configuration is reloaded
- **THEN** the system SHALL compare new config with cached config
- **AND** only flush cache if relevant values changed

### Requirement: System SHALL support environment-specific configuration
The system SHALL support different configuration for different environments (development, production, test).

#### Scenario: Environment detection
- **WHEN** `NODE_ENV` environment variable is set
- **THEN** the system SHALL load environment-specific configuration:
  - `NODE_ENV=development` → `.env.local`, `config/lcl.dev.json`
  - `NODE_ENV=production` → `.env.production`, `config/lcl.prod.json`
  - `NODE_ENV=test` → `.env.test`, `config/lcl.test.json`

### Requirement: System SHALL provide configuration defaults
The system SHALL provide safe default values for optional configuration.

#### Scenario: Default algorithm
- **WHEN** no algorithm is specified
- **THEN** the system SHALL use `AES_256_GCM` as default (matches Java default)

#### Scenario: Default cache TTL
- **WHEN** no cache TTL is specified
- **THEN** the system SHALL use 1 hour (3600000 ms) as default

#### Scenario: Default key vault collection
- **WHEN** no key vault collection name is specified
- **THEN** the system SHALL use `__lcl_keyvault` (matches Java)

### Requirement: System SHALL support configuration encryption at rest
The system SHALL support encrypting sensitive configuration values in files.

#### Scenario: Encrypted configuration file
- **WHEN** `config/lcl.json.enc` exists
- **THEN** the system SHALL decrypt it using a master passphrase from environment variable `LCL_CONFIG_PASSPHRASE`
- **AND** the decrypted content SHALL be parsed as JSON

### Requirement: System SHALL log configuration source resolution
The system SHALL log which configuration sources were used during initialization (without logging secret values).

#### Scenario: Configuration source logging
- **WHEN** configuration is loaded
- **THEN** the system SHALL log: "Loaded configuration from: [source1, source2, ...]"
- **AND** secret values (CMK, MongoDB URI) SHALL be masked in logs (e.g., "LCL_CMK_KEY: ****")
- **AND** the log level SHALL be INFO

### Requirement: System SHALL support configuration validation schemas
The system SHALL validate configuration against a JSON schema to ensure completeness and correctness.

#### Scenario: Schema validation
- **WHEN** configuration is loaded
- **THEN** the system SHALL validate against a predefined JSON schema
- **AND** if validation fails, all validation errors SHALL be reported
- **AND** the error message SHALL include the path to the invalid field and expected format
