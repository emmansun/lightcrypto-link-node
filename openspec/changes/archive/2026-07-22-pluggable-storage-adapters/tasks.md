## 1. VaultStore SPI Layer (src/adapter/)

- [x] 1.1 Create `src/adapter/VaultStore.js` — abstract base class with async save/load/exists/rotate/loadAll (throw 'Not implemented')
- [x] 1.2 Create `src/adapter/VaultDocument.js` — plain data model with validation (id, v, status, activeKid, keys[], cmk, createdAt, updatedAt)
- [x] 1.3 Create `src/adapter/OptimisticLockError.js` — custom Error subclass with namespace/expected/actual version info
- [x] 1.4 Write unit tests `test/unit/adapter/VaultDocument.test.js`
- [x] 1.5 Write unit tests `test/unit/adapter/OptimisticLockError.test.js`

## 2. InMemoryVaultStore (src/adapter/)

- [x] 2.1 Create `src/adapter/InMemoryVaultStore.js` — Map-based implementation with deep copy semantics + clear() utility
- [x] 2.2 Write unit tests `test/unit/adapter/InMemoryVaultStore.test.js` — save/load/exists/rotate/loadAll/clear + OptimisticLockError on version mismatch

## 3. MongoVaultStore (src/adapter/)

- [x] 3.1 Create `src/adapter/MongoVaultStore.js` — native mongodb driver; accepts Db instance; BSON Document ↔ plain VaultDocument conversion; rotate via replaceOne + version filter; collection `__lcl_keyvault`
- [x] 3.2 Write unit tests `test/unit/adapter/MongoVaultStore.test.js` (mock mongodb Db/Collection)

## 4. KeyVaultService Refactor (src/service/)

- [x] 4.1 Refactor `src/service/KeyVaultService.js` — constructor accepts `{ vaultStore, cmkProvider, cacheTtl }`; remove `this._connection` and `getKeyVaultModel` usage
- [x] 4.2 Refactor `ensureVaultInitialized()` — use `vaultStore.load()` / `vaultStore.save()` with plain VaultDocument
- [x] 4.3 Refactor `rotateDek()` — use `vaultStore.rotate()` with OptimisticLockError propagation
- [x] 4.4 Update `test/unit/service/KeyVaultService.test.js` — use InMemoryVaultStore instead of Mongoose mocks

## 5. Plugin Layer Update (src/plugin/)

- [x] 5.1 Refactor `src/plugin/lclCryptoPlugin.js` — accept `vaultStore` or `connection` (extract native client via `connection.getClient()` to construct MongoVaultStore); throw if neither provided
- [x] 5.2 Update `test/unit/plugin/lclCryptoPlugin.test.js` — test both configuration paths

## 6. Public API & Index

- [x] 6.1 Update `src/index.js` — export VaultStore, VaultDocument, OptimisticLockError, MongoVaultStore, InMemoryVaultStore
- [x] 6.2 Update `test/unit/index.test.js` — verify new exports

## 7. Integration Tests & Cleanup

- [x] 7.1 Update `test/integration/keyVaultService.test.js` — use MongoVaultStore with mongodb-memory-server
- [x] 7.2 Update `test/integration/mongoosePlugin.test.js` — verify plugin with connection auto-wrapping (getClient path)
- [x] 7.3 Delete `src/model/KeyVaultDocument.js` and remove all references
- [x] 7.4 Run full test suite (`npx jest --forceExit`) and fix any remaining failures
