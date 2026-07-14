## 1. Core Implementation

- [x] 1.1 Create `src/service/ProgrammaticCryptoService.js` with constructor accepting `{ keyVaultService, fieldCryptoService, algorithm }` and validating required dependencies
- [x] 1.2 Implement `encryptValue(value, entityName, algorithm?)` — resolve active kid and DEK via `keyVaultService`, serialize value via `TypeSerializer`, encrypt via `CryptoCodec`, return canonical sub-document `{ _e, _k, _a, _t, c }`
- [x] 1.3 Implement `decryptValue(encryptedSubDocument)` — validate `_e`, `_k`, `_t`, `c` markers, resolve DEK by kid via `keyVaultService`, decrypt via `CryptoCodec`, deserialize via `TypeDeserializer`
- [x] 1.4 Implement `decryptDocument(rawDocument, entityName, encryptedFields)` — iterate `encryptedFields`, decrypt each sub-document field via `decryptValue`, mutate in-place, return same reference
- [x] 1.5 Export `ProgrammaticCryptoService` from `src/index.js`

## 2. Unit Tests

- [x] 2.1 Create `test/unit/service/ProgrammaticCryptoService.test.js` — test constructor validation (missing keyVaultService, custom algorithm, default algorithm)
- [x] 2.2 Test `encryptValue` — string, number, boolean types; custom algorithm override; null/missing entityName throw
- [x] 2.3 Test `decryptValue` — round-trip with encryptValue; missing markers (`_e`, `_k`, `_t`) throw; null throws
- [x] 2.4 Test `decryptDocument` — multi-field decrypt; skip non-encrypted fields; skip missing fields; returns same reference
- [x] 2.5 Test error handling — wrong entity DEK (KCV mismatch); unsupported algorithm

## 3. Integration Tests

- [x] 3.1 Create `test/integration/programmaticCryptoService.test.js` with MongoMemoryServer — full round-trip: encrypt with programmatic API, save to MongoDB, read back, decrypt with programmatic API
- [x] 3.2 Test cross-compatibility: encrypt via Mongoose plugin, decrypt via programmatic API (same entity/DEK)
- [x] 3.3 Test decryptDocument on raw aggregation pipeline results

## 4. Example and Documentation

- [x] 4.1 Create `examples/programmatic-encrypt.js` — demonstrate encryptValue, decryptValue, decryptDocument usage
- [x] 4.2 Update `examples/README.md` with new example entry
- [x] 4.3 Update `README.md` Programmatic API section with `ProgrammaticCryptoService` usage
