## ADDED Requirements

### Requirement: ESM named exports
The package SHALL provide an ESM entry point that exposes all public API symbols as named exports. Consumers using `import { X } from 'lightcrypto-link-node'` SHALL receive the same constructor/function reference as `require('lightcrypto-link-node').X`.

#### Scenario: Named import of all public API symbols
- **WHEN** an ESM consumer executes `import { CryptoCodec, BsonCodec, AesGcmEncryptor, AesCbcEncryptor, Sm4CbcEncryptor, SymmetricEncryptor, TypeSerializer, TypeDeserializer, KeyVaultService, FieldCryptoService, FatalCryptoError, DecryptionError, ProgrammaticCryptoService, CmkProvider, LocalCmkProvider, AzureKmsProvider, AlibabaKmsProvider, LclConfig, lclCryptoPlugin, prepareEncryptedSchema, rewriteQuery, getKeyVaultModel } from 'lightcrypto-link-node'`
- **THEN** each imported symbol SHALL be defined and have the same type (function/class) as the corresponding property on the CJS `module.exports` object

#### Scenario: Named export is identical to CJS export
- **WHEN** an ESM consumer imports `CryptoCodec` via named import and a CJS consumer requires `CryptoCodec` via `require('lightcrypto-link-node').CryptoCodec`
- **THEN** both references SHALL be strictly equal (`===`) to the same constructor function

### Requirement: ESM default export
The package SHALL provide a default export containing the complete public API object, enabling `import lib from 'lightcrypto-link-node'` usage.

#### Scenario: Default import contains all API symbols
- **WHEN** an ESM consumer executes `import lib from 'lightcrypto-link-node'`
- **THEN** `lib` SHALL be an object containing all 22 public API symbols as properties

#### Scenario: Default export matches CJS module.exports
- **WHEN** comparing the ESM default export with `require('lightcrypto-link-node')`
- **THEN** both SHALL reference the same object (strict equality)

### Requirement: CJS backward compatibility
The package SHALL maintain full backward compatibility for CommonJS consumers. `require('lightcrypto-link-node')` SHALL continue to return the same exports object with identical behavior.

#### Scenario: CJS require unchanged
- **WHEN** a CJS consumer executes `const lib = require('lightcrypto-link-node')`
- **THEN** `lib` SHALL contain all public API symbols and behave identically to the pre-change version

#### Scenario: CJS destructured require unchanged
- **WHEN** a CJS consumer executes `const { AesGcmEncryptor, LocalCmkProvider } = require('lightcrypto-link-node')`
- **THEN** both symbols SHALL be usable constructors identical to previous versions

### Requirement: Conditional exports configuration
The `package.json` SHALL use the `exports` field with `import` and `require` conditions to route ESM and CJS consumers to their respective entry points.

#### Scenario: Node.js resolves ESM entry for import
- **WHEN** Node.js resolves `import ... from 'lightcrypto-link-node'` in an ESM context
- **THEN** it SHALL load the `.mjs` ESM wrapper entry point

#### Scenario: Node.js resolves CJS entry for require
- **WHEN** Node.js resolves `require('lightcrypto-link-node')` in a CJS context
- **THEN** it SHALL load `src/index.js` (the existing CJS entry)

#### Scenario: Fallback for legacy bundlers
- **WHEN** a bundler that does not support `exports` field resolves the package
- **THEN** it SHALL fall back to `main` (CJS) or `module` (ESM) fields

### Requirement: Export consistency guarantee
The ESM wrapper SHALL export exactly the same set of symbols as the CJS entry point. Adding a new public API symbol to `src/index.js` without updating `src/index.mjs` SHALL be detected by automated tests.

#### Scenario: Automated consistency check
- **WHEN** the test suite runs the export consistency check
- **THEN** it SHALL verify that every key in CJS `module.exports` has a corresponding named export in the ESM wrapper, and vice versa

### Requirement: Zero build step
The dual-module support SHALL NOT require any build/compile/bundle step. The ESM entry point SHALL be a static source file committed to the repository.

#### Scenario: Package publish without build
- **WHEN** `npm publish` is executed without running any build command
- **THEN** both CJS and ESM entry points SHALL be present in the published package and fully functional
