## 1. Error Module (src/error/)

- [x] 1.1 Create `src/error/LclCryptoError.js` — base class with `.code`, `.namespace`, `.dekVersion`, `.kid`, `.fieldName`, `.cause` context fields, constructor accepts `(message, context)`
- [x] 1.2 Create `src/error/PayloadCorruptionError.js` — code `ERR_LCL_PAYLOAD_CORRUPTION`, extra fields `.blobLength`, `.expectedMinLength`
- [x] 1.3 Create `src/error/KeyResolutionError.js` — code `ERR_LCL_KEY_RESOLUTION`, extra field `.vaultExists`
- [x] 1.4 Create `src/error/CryptoAuthenticationError.js` — code `ERR_LCL_CRYPTO_AUTH`
- [x] 1.5 Create `src/error/SchemaDriftError.js` — code `ERR_LCL_SCHEMA_DRIFT`, extra fields `.typeMarker`, `.rawBytes`
- [x] 1.6 Create `src/error/UnsupportedAlgorithmError.js` — code `ERR_LCL_UNSUPPORTED_ALGORITHM`, extra field `.algorithm`
- [x] 1.7 Create `src/error/index.js` — unified exports of all 6 classes

## 2. WireFormatDecoder Error Replacement

- [x] 2.1 Replace all 4 throw points in `src/format/WireFormatDecoder.js` with `PayloadCorruptionError` (non-Buffer input, truncated blob, unsupported version, empty ciphertext), populating `.blobLength`/`.expectedMinLength`/`.cause` as applicable

## 3. CryptoCodec Error Classification

- [x] 3.1 In `src/crypto/CryptoCodec.js` `decrypt()`: wrap `encryptor.decrypt()` call in try/catch, re-throw as `CryptoAuthenticationError` with `.cause`, `.namespace`, `.dekVersion` from decoded wire format header
- [x] 3.2 Replace "Unsupported data format" throw with `PayloadCorruptionError`
- [x] 3.3 Replace "Unsupported algorithm" throw in `getEncryptor()` with `UnsupportedAlgorithmError`

## 4. FieldCryptoService Error Refinement

- [x] 4.1 Remove `FatalCryptoError` and `DecryptionError` class definitions from `src/service/FieldCryptoService.js`
- [x] 4.2 Replace "Invalid encryption marker" throw with `PayloadCorruptionError`
- [x] 4.3 Replace "Unsupported algorithm / no algorithm specified" throws with `UnsupportedAlgorithmError`
- [x] 4.4 Replace "Missing ciphertext field" throw with `PayloadCorruptionError`
- [x] 4.5 Remove the generic try/catch around `this._codec.decrypt()` — let `CryptoAuthenticationError` propagate directly
- [x] 4.6 Wrap `TypeDeserializer.deserialize()` in try/catch → throw `SchemaDriftError` with `.typeMarker`, `.rawBytes`, `.cause`
- [x] 4.7 Update module.exports: remove `FatalCryptoError`/`DecryptionError`, export only `FieldCryptoService`

## 5. KeyVaultService Decrypt Path Purification

- [x] 5.1 Extract `_populateCache(namespace, vaultDoc)` private method from `ensureVaultInitialized` (unwrap keys + fill cache logic)
- [x] 5.2 Refactor `ensureVaultInitialized` to call `_populateCache` internally (behavior unchanged)
- [x] 5.3 Create `_ensureCachedForEncrypt(namespace)` — calls `ensureVaultInitialized` on cache miss (current behavior)
- [x] 5.4 Create `_ensureCachedForDecrypt(namespace)` — calls `vaultStore.load()` only; if null → throw `KeyResolutionError` with `.vaultExists = false`; otherwise `_populateCache`
- [x] 5.5 Route `getActiveKeyPair`, `getActiveDekVersion`, `getActiveHmacKey` to `_ensureCachedForEncrypt`
- [x] 5.6 Route `getDekByVersion`, `getKeyPair` to `_ensureCachedForDecrypt`
- [x] 5.7 Replace "Unknown kid" / "No key found" generic Errors with `KeyResolutionError` (`.namespace`, `.kid`/`.dekVersion`, `.vaultExists = true`)
- [x] 5.8 Remove old `_ensureCached` method

## 6. Plugin Decrypt Path + EventBus

- [x] 6.1 In `lclCryptoPlugin.decryptSubDoc`: remove `await keyVaultService.ensureVaultInitialized(namespace)` call
- [x] 6.2 Wrap `decryptSubDoc` body in try/catch: on `LclCryptoError`, emit `lcl.decrypt.field.failed` event via `eventBus` with tier based on error type (CryptoAuth→L3, KeyResolution/PayloadCorruption/UnsupportedAlgorithm→L2, SchemaDrift→L1), then re-throw
- [x] 6.3 Replace "Unsupported ciphertext format" throw in `decryptSubDoc` with `PayloadCorruptionError`

## 7. Public API (index.js / index.mjs)

- [x] 7.1 Update `src/index.js`: remove `FatalCryptoError`/`DecryptionError` exports, add `LclCryptoError`, `PayloadCorruptionError`, `KeyResolutionError`, `CryptoAuthenticationError`, `SchemaDriftError`, `UnsupportedAlgorithmError`
- [x] 7.2 Update `src/index.mjs` to match

## 8. Tests

- [x] 8.1 Create `test/unit/error/errorHierarchy.test.js` — instanceof checks, .code values, context field population for all 6 classes
- [x] 8.2 Update `test/unit/format/WireFormatDecoder.test.js` — assert `PayloadCorruptionError` instead of generic Error
- [x] 8.3 Update `test/unit/crypto/CryptoCodec.test.js` — assert `CryptoAuthenticationError` on auth failure, `UnsupportedAlgorithmError` on unknown algo
- [x] 8.4 Update `test/unit/service/FieldCryptoService.test.js` — assert new error types for each failure scenario
- [x] 8.5 Update `test/unit/service/KeyVaultService.test.js` — assert `KeyResolutionError` on decrypt path, verify vault NOT created on decrypt miss
- [x] 8.6 Add test: decrypt path does not call `vaultStore.save()` when vault missing (mock spy)
- [x] 8.7 Add test: plugin `decryptSubDoc` emits EventBus event on failure with correct tier and attributes
- [x] 8.8 Update any other tests referencing `DecryptionError`/`FatalCryptoError` (grep and fix)

## 9. Quality Gates

- [x] 9.1 Run `npm run lint` and fix any issues
- [x] 9.2 Run full test suite `npm test` and confirm all pass
