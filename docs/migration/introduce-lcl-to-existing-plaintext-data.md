# Migration Guide: Introduce LightCrypto-Link to Existing Plaintext Data

This guide explains runtime behavior when a project starts with plaintext MongoDB data and later introduces LightCrypto-Link (Node.js SDK).

## Scenario

- Existing records were written before LightCrypto-Link was enabled.
- New records are written after enabling LightCrypto-Link and use encrypted sub-documents.
- Some encrypted fields may use blind index.

## Behavior Summary

### Read behavior

- Plaintext historical values are read successfully.
- During post-find decryption, only values in encrypted sub-document format (`{ _e: 1, _k, _a, _t, c }`) are decrypted.
- If a value is not an encrypted sub-document, it is left unchanged.
- Unchanged plaintext values pass through to application code as-is.

Result: historical plaintext data does not fail just because LightCrypto-Link is enabled.

Notes:

- This is true when stored plaintext type is compatible with the Mongoose schema field type.
- If historical data has incompatible types, Mongoose casting can still fail as a normal validation issue.

### Write behavior

- Re-saving a document automatically encrypts plaintext fields (lazy migration).
- The pre-save hook detects plaintext values and encrypts them before persistence.
- Blind index fields are computed and stored alongside the encrypted sub-document.

Result: any document touch (save/update) progressively migrates data to encrypted format.

### Query behavior for fields with blind index

- Queries on encrypted fields with `blindIndex: true` are rewritten to blind-index lookup (`b` field).
- Historical plaintext records do not contain blind-index data.

Result: queries may miss historical plaintext records. This is a coverage gap, not an exception.

### Query behavior for fields without blind index

- Querying an encrypted field without `blindIndex: true` throws an error by design.

Result: the query path throws `Error: Query on encrypted field 'X' requires blindIndex: true`.

### Operator constraints

- For encrypted fields with `blindIndex: true`, only exact-match and `$in` are supported.
- Range/pattern operators (`$gt`, `$lt`, `$gte`, `$lte`, `$regex`, `$text`, `$ne`, `$nin`) throw explicit errors.

### Legacy encrypted format edge case

- If old encrypted records exist in an incompatible structure (e.g., missing `_k` kid field), decryption throws `PayloadCorruptionError`.

Result: this is a data-format compatibility issue, not a plaintext-legacy issue.

## Recommended Rollout

1. Enable LightCrypto-Link plugin on the Mongoose schema (write path encrypts immediately).
2. Read path is automatically compatible with both plaintext and encrypted values.
3. Plan a backfill job to migrate historical plaintext records to encrypted format.
4. Blind index data is computed automatically during backfill (triggered by save).
5. Add operational monitoring:
   - plaintext vs encrypted record ratio
   - query miss ratio for blind-index paths
6. Remove temporary compatibility handling after migration completion.

## Temporary Query Strategy During Migration Window

If business requires full hit-rate before backfill completion, use an application-side migration window strategy:

```javascript
// Temporary: dual-path query during migration window
async function findUserByPhone(phone) {
  // Path 1: blind-index query (matches encrypted records)
  const encrypted = await User.findOne({ phone });

  // Path 2: legacy plaintext query (temporary, remove after migration)
  const plaintext = await User.collection.findOne({
    phone: phone,  // direct plaintext match on raw collection
    'phone._e': { $exists: false }  // only plaintext docs
  });

  return encrypted || plaintext;
}
```

This should be temporary and removed after data backfill is complete.

## Runnable Backfill Example

This repository includes a runnable reference implementation:

- Runner: [`examples/plaintext-backfill.js`](../../examples/plaintext-backfill.js)

Recommended flow:

1. Run dry-run first to estimate candidate volume.
2. Run real backfill with controlled batch size.
3. Resume from the last cursor when needed (`--start-after-id`).

Example commands:

```bash
# Dry-run: estimate how many records need migration
node examples/plaintext-backfill.js --dry-run

# Real backfill with batch size control
node examples/plaintext-backfill.js --batch-size=500

# Resume from last cursor if interrupted
node examples/plaintext-backfill.js --batch-size=500 --start-after-id=6691a2b3c4d5e6f7a8b9c0d1
```

Backfill strategy used by the runner:

- Page by `_id` in ascending order.
- Select candidates likely to be plaintext or missing blind index.
- Load document and call `save()` to trigger normal encryption write path.
- Print progress and cursor each batch for restartability.

## Checklist

- [ ] Confirm encrypted fields that are queryable have `blindIndex: true`.
- [ ] Run backfill dry-run to estimate migration volume.
- [ ] Run backfill for historical plaintext data.
- [ ] Verify blind-index fields (`b`) exist on migrated records.
- [ ] Validate query hit-rate before and after migration.
- [ ] Remove migration-window fallback query logic.
- [ ] Remove `console.log` progress reporting from backfill script.
