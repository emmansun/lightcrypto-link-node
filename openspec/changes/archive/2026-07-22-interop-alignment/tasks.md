## 1. Format Layer (src/format/)

- [x] 1.1 Create `src/format/AlgorithmId.js` — algorithm registry (0x01=AES_256_GCM, 0x02=AES_256_CBC, 0x04=SM4_CBC) with id/ivLength/keyLength/isGcm/fromByte
- [x] 1.2 Create `src/format/WireFormatEncoder.js` — encode(algorithm, namespace, dekVersion, iv, ciphertext) → Buffer; encodeToBase64Url() → String; buildAad(algorithm, namespace, dekVersion) → Buffer
- [x] 1.3 Create `src/format/WireFormatDecoder.js` — decode(blob) → {version, algorithm, namespace, dekVersion, iv, aadExt, ciphertext}; decodeFromBase64Url(str); reconstructAad()
- [x] 1.4 Write unit tests `test/unit/format/AlgorithmId.test.js`
- [x] 1.5 Write unit tests `test/unit/format/WireFormatEncoder.test.js`
- [x] 1.6 Write unit tests `test/unit/format/WireFormatDecoder.test.js`

## 2. Namespace Model (src/namespace/)

- [x] 2.1 Create `src/namespace/Namespace.js` — parse(raw), of(tenant,realm,entity,field), canonical(), canonicalBytes(), validation rules
- [x] 2.2 Write unit tests `test/unit/namespace/Namespace.test.js`

## 3. Blind Index Engine (src/blindindex/)

- [x] 3.1 Create `src/blindindex/BlindIndexEngine.js` — HKDF-SHA256 key derivation (crypto.hkdfSync) + HMAC-SHA256 computation + derived key cache
- [x] 3.2 Write unit tests `test/unit/blindindex/BlindIndexEngine.test.js`

## 4. Encryptor Interface Refactor (src/crypto/)

- [x] 4.1 Refactor `src/crypto/SymmetricEncryptor.js` — new interface: encrypt(key, iv, plaintext, aad), decrypt(key, iv, ciphertext, aad), computeKcv(key), algorithmId()
- [x] 4.2 Refactor `src/crypto/AesGcmEncryptor.js` — accept external IV + AAD via setAAD(), return CT‖Tag only
- [x] 4.3 Refactor `src/crypto/AesCbcEncryptor.js` — accept external IV, ignore AAD, return PKCS5-padded CT only
- [x] 4.4 Refactor `src/crypto/Sm4CbcEncryptor.js` — accept external IV, ignore AAD, return PKCS5-padded CT only
- [x] 4.5 Update existing encryptor unit tests to match new interface signatures

## 5. CryptoCodec Refactor (src/crypto/CryptoCodec.js)

- [x] 5.1 Refactor CryptoCodec.encrypt() — generate IV externally, build AAD via WireFormatEncoder, call encryptor, assemble Wire Format V1 Base64URL output
- [x] 5.2 Refactor CryptoCodec.decrypt() — decode Wire Format V1 blob, reconstruct AAD, call encryptor.decrypt with extracted IV/ciphertext
- [x] 5.3 Replace generateBlindIndex() with BlindIndexEngine integration (accept namespace parameter)
- [x] 5.4 Update CryptoCodec unit tests

## 6. Service Layer Integration

- [x] 6.1 Refactor `src/service/FieldCryptoService.js` — encryptField accepts namespace + dekVersion; `c` field outputs Base64URL string; decryptField parses Wire Format V1
- [x] 6.2 Refactor `src/service/KeyVaultService.js` — expose dekVersion (vault `v` field) in cache entry; pass to encryption layer
- [x] 6.3 Refactor `src/plugin/lclCryptoPlugin.js` — construct namespace from entityName + fieldName (shorthand `Entity#field`); pass namespace + dekVersion to FieldCryptoService
- [x] 6.4 Refactor `src/plugin/queryRewriter.js` — use BlindIndexEngine with namespace for blind index query rewriting
- [x] 6.5 Update `src/service/ProgrammaticCryptoService.js` — accept namespace parameter, pass through to CryptoCodec

## 7. Golden Vector Test Suite

- [x] 7.1 Copy Java `vectors/` directory to `test/vectors/` (encryption/, blind-index/, kcv/, roundtrip/, manifest.json)
- [x] 7.2 Create `test/golden/encryption.test.js` — validate all encryption vectors (AES-256-GCM, AES-256-CBC, SM4-CBC) produce byte-identical wireFormatHex
- [x] 7.3 Create `test/golden/blind-index.test.js` — validate all blind-index vectors (derivedHmacKeyHex + blindIndexBase64url)
- [x] 7.4 Create `test/golden/kcv.test.js` — validate all KCV vectors + binding vector
- [x] 7.5 Create `test/golden/roundtrip.test.js` — validate decrypt of wireFormatBase64url reproduces plaintextHex

## 8. Existing Test Adaptation

- [x] 8.1 Rewrite `test/interoperability/java-nodejs.test.js` — use Wire Format V1 assertions, remove old Buffer format expectations
- [x] 8.2 Update `test/unit/crypto/AesGcmEncryptor.test.js` — new interface (key, iv, plaintext, aad)
- [x] 8.3 Update `test/unit/crypto/AesCbcEncryptor.test.js` — new interface
- [x] 8.4 Update `test/unit/crypto/Sm4CbcEncryptor.test.js` — new interface
- [x] 8.5 Update `test/unit/crypto/CryptoCodec.test.js` — Wire Format V1 output format
- [x] 8.6 Update `test/unit/service/FieldCryptoService.test.js` — namespace/dekVersion params, Base64URL `c` field
- [x] 8.7 Update `test/unit/plugin/lclCryptoPlugin.test.js` — namespace construction
- [x] 8.8 Update `test/unit/plugin/queryRewriter.test.js` — BlindIndexEngine integration
- [x] 8.9 Update integration tests (`test/integration/mongoosePlugin.test.js`, `programmaticCryptoService.test.js`)

## 9. Public API & Index

- [x] 9.1 Update `src/index.js` — export new modules (Namespace, BlindIndexEngine, AlgorithmId, WireFormatEncoder, WireFormatDecoder)
- [x] 9.2 Update `test/unit/index.test.js` — verify new exports
- [x] 9.3 Run full test suite (`npx jest --forceExit`) and fix any remaining failures
