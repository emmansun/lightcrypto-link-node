# Troubleshooting

## Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| KCV mismatch | Key corruption or wrong CMK | Verify CMK matches the one used to create the vault |
| missing '_k' (kid) field | Malformed encrypted sub-document | Check document was encrypted by compatible library version |
| Unsupported algorithm | Unknown `_a` value | Ensure both Java and Node.js use supported algorithms |
| CMK must be 64 hex chars | Invalid CMK format | Provide a valid 64-character hex string (32 bytes) |
| cmkVersion is required for unwrap | Missing key version metadata | Ensure wrap() was called with a provider that stores cmkVersion |
| Azure/Alibaba SDK not installed | Missing optional dependency | `npm install @azure/keyvault-keys @azure/identity` or `npm install @alicloud/kms20160120 @alicloud/openapi-client` |

## Security Best Practices

1. **Never store CMK in code** — use environment variables or secret managers
2. **Rotate DEKs periodically** — use `keyVaultService.rotateDek('Entity')`
3. **Flush cache on shutdown** — `keyVaultService.flushCache()` securely destroys key material
4. **Use AES-256-GCM** — provides authenticated encryption (integrity + confidentiality)
5. **Enable blind indexes selectively** — only for fields that need exact-match queries

## Limitations

- **SM4-GCM**: Deferred until OpenSSL 3.3+ is widely available
- **Range queries**: Not supported on encrypted fields (`$gt`, `$lt`, `$gte`, `$lte`)
- **Full-text search**: Not supported on encrypted fields (`$text`)
- **Regex queries**: Not supported on encrypted fields (pattern matching)
- **Java Long precision**: Use `mongoose-long` for Long fields exceeding JavaScript safe integer range

## Enterprise Development

### Local Development with Enterprise npm Registry

If you're in China or behind a corporate firewall, create a local `.npmrc` file from the template:

```bash
cp .npmrc.example .npmrc
```

**IMPORTANT**: `.npmrc` is in `.gitignore` and will NOT be committed to the repository.

### CI/CD Configuration

GitHub Actions workflows use the official npm registry:

```yaml
- name: Configure npm to use official registry
  run: npm config set registry https://registry.npmjs.org
```

### package-lock.json

The project **does NOT commit `package-lock.json`** to avoid exposing enterprise registry URLs:

- Local development uses `.npmrc` with enterprise mirrors
- CI/CD uses `npm install` with the official registry
- Builds are reproducible through pinned versions in `package.json`
