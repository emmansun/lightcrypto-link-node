# Examples

This directory contains usage examples for lightcrypto-link-node.

## Prerequisites

```bash
# Install project dependencies
npm install

# Ensure a local MongoDB is running on localhost:27017
# Or set LCL_MONGODB_URI to specify a custom connection string
```

## Local Examples (No Cloud Credentials Required)

### [basic-crud.js](./basic-crud.js)

Basic CRUD example: User schema with automatic encryption/decryption on `phone`/`ssn` fields, plus blind index queries.

```bash
node examples/basic-crud.js
```

### [multi-algorithm.js](./multi-algorithm.js)

Multi-algorithm example: Demonstrates encryption/decryption with AES-256-GCM, AES-256-CBC, and SM4-CBC. No MongoDB required.

```bash
node examples/multi-algorithm.js
```

### [key-rotation.js](./key-rotation.js)

Key rotation example: Demonstrates backward-compatible decryption after DEK rotation.

```bash
node examples/key-rotation.js
```

### [config-from-env.js](./config-from-env.js)

Configuration management example: Demonstrates loading config from environment variables, Secret Managers, and JSON config files. No MongoDB required.

```bash
node examples/config-from-env.js
```

### [programmatic-encrypt.js](./programmatic-encrypt.js)

Programmatic encryption example: Demonstrates `encryptValue`, `decryptValue`, and `decryptDocument` for use outside the Mongoose plugin — raw driver queries, aggregation pipelines, and migration scripts.

```bash
node examples/programmatic-encrypt.js
```

## Cloud KMS Examples

### [azure-kms.js](./azure-kms.js)

Azure Key Vault example: Supports both local wrap (recommended, using RSA public key) and remote wrap modes.

```bash
# 1. Install Azure SDK
npm install @azure/keyvault-keys @azure/identity

# 2. Set environment variables
$env:AZURE_TENANT_ID = "your-tenant-id"
$env:AZURE_CLIENT_ID = "your-client-id"
$env:AZURE_CLIENT_SECRET = "your-client-secret"
$env:LCL_AZURE_KEY_NAME = "your-key-name"
$env:LCL_AZURE_VAULT_URL = "https://your-vault.vault.azure.net"
# Optional (latest version auto-resolved from KMS if omitted)
$env:LCL_AZURE_CMK_VERSION = "key-version-id"
# Optional (enables local wrap for faster, cheaper operations)
$env:LCL_AZURE_PUBLIC_KEY_PEM = "-----BEGIN PUBLIC KEY-----..."

# 3. Run
node examples/azure-kms.js
```

### [alibaba-kms.js](./alibaba-kms.js)

Alibaba Cloud KMS example: Supports both symmetric keys (Aliyun_AES_256) and asymmetric keys (RSA_2048).

```bash
# 1. Install Alibaba Cloud SDK
npm install @alicloud/kms20160120 @alicloud/openapi-client

# 2. Set environment variables
$env:ALIBABA_CLOUD_ACCESS_KEY_ID = "your-access-key-id"
$env:ALIBABA_CLOUD_ACCESS_KEY_SECRET = "your-access-key-secret"
$env:LCL_ALIBABA_KMS_KEY_ID = "key-xxxxx"
$env:LCL_ALIBABA_KMS_REGION = "cn-hangzhou"
$env:LCL_ALIBABA_KMS_ENDPOINT = "kms.cn-hangzhou.aliyuncs.com"
$env:LCL_ALIBABA_KMS_KEY_TYPE = "symmetric"        # or "asymmetric"
# Optional for asymmetric mode (auto-resolved from KMS if omitted)
$env:LCL_ALIBABA_KMS_CMK_VERSION = "key-version-id"
$env:LCL_ALIBABA_KMS_PUBLIC_KEY_PEM = "-----BEGIN PUBLIC KEY-----..."

# 3. Run
node examples/alibaba-kms.js
```

## Environment Variables Reference

| Variable | Description | Default |
|----------|-------------|---------|
| `LCL_CMK_KEY` | Local symmetric CMK (64 hex chars) | - |
| `LCL_MONGODB_URI` | MongoDB connection URI | `mongodb://localhost:27017/lightcrypto-demo` |
| `LCL_ALGORITHM` | Encryption algorithm | `AES_256_GCM` |
| `LCL_CACHE_TTL` | DEK cache TTL (ms) | `3600000` |
| `LCL_CMK_PROVIDER` | CMK provider | `local-symmetric` |

## Supported Encryption Algorithms

| Algorithm ID | Description |
|--------------|-------------|
| `AES_256_GCM` | AES-256-GCM (recommended default) |
| `AES_256_CBC` | AES-256-CBC (legacy compatibility) |
| `SM4_CBC` | SM4-CBC (China national crypto compliance) |
