'use strict';

/**
 * Alibaba Cloud KMS Example
 *
 * Demonstrates two key types:
 * 1. **Symmetric CMK** (Aliyun_AES_256): Uses Encrypt/Decrypt APIs.
 *    - wrap captures returned keyVersionId in metadata automatically
 *    - unwrap does NOT need keyVersionId
 * 2. **Asymmetric CMK** (RSA_2048): Uses AsymmetricEncrypt/Decrypt APIs.
 *    - With publicKeyPem: Local wrap (recommended, faster, cheaper)
 *    - Without publicKeyPem: Remote wrap via KMS API
 *    - cmkVersion (keyVersionId) is required for asymmetric operations
 *
 * Prerequisites:
 *   npm install @alicloud/kms20160120 @alicloud/openapi-client
 *   Set environment variables:
 *     ALIBABA_CLOUD_ACCESS_KEY_ID
 *     ALIBABA_CLOUD_ACCESS_KEY_SECRET
 *     LCL_ALIBABA_KMS_KEY_ID=key-xxxxx
 *     LCL_ALIBABA_KMS_REGION=cn-hangzhou
 *     LCL_ALIBABA_KMS_ENDPOINT=kms.cn-hangzhou.aliyuncs.com
 *     LCL_ALIBABA_KMS_KEY_TYPE=symmetric|asymmetric
 *     LCL_ALIBABA_KMS_CMK_VERSION (required for asymmetric)
 *     LCL_ALIBABA_KMS_PUBLIC_KEY_PEM (optional, for local asymmetric wrap)
 */

const mongoose = require('mongoose');
const { AlibabaKmsProvider, KeyVaultService, lclCryptoPlugin, prepareEncryptedSchema } = require('../src');

async function main() {
  const keyType = process.env.LCL_ALIBABA_KMS_KEY_TYPE || 'symmetric';

  // 1. Configure Alibaba KMS provider
  const alibabaProvider = new AlibabaKmsProvider({
    keyId: process.env.LCL_ALIBABA_KMS_KEY_ID || 'key-xxxxx',
    keyType,  // 'symmetric' or 'asymmetric'
    cmkVersion: process.env.LCL_ALIBABA_KMS_CMK_VERSION || null,  // keyVersionId (required for asymmetric)
    region: process.env.LCL_ALIBABA_KMS_REGION || 'cn-hangzhou',
    endpoint: process.env.LCL_ALIBABA_KMS_ENDPOINT || 'kms.cn-hangzhou.aliyuncs.com',
    accessKeyId: process.env.ALIBABA_CLOUD_ACCESS_KEY_ID,
    accessKeySecret: process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET,
    publicKeyPem: process.env.LCL_ALIBABA_KMS_PUBLIC_KEY_PEM || null  // For local asymmetric wrap
  });

  console.log('Provider ID:', alibabaProvider.getProviderId());  // 'alibaba-kms'
  console.log('Public Reference:', alibabaProvider.getPublicReference());  // keyId
  console.log('Key Type:', keyType);
  console.log('CMK Version:', alibabaProvider.getCmkVersion());

  // 2. Connect to MongoDB
  await mongoose.connect(process.env.LCL_MONGODB_URI || 'mongodb://localhost:27017/lightcrypto-alibaba-demo');

  // 3. Create KeyVaultService with Alibaba provider
  const keyVaultService = new KeyVaultService({
    connection: mongoose.connection,
    cmkProvider: alibabaProvider,
    cacheTtl: 3600000
  });

  // 4. Define schema (Mongoose 9: use prepareEncryptedSchema)
  const userSchema = new mongoose.Schema(prepareEncryptedSchema({
    name: String,
    phone: { type: String, encrypt: true, blindIndex: true }
  }));

  // Use SM4-CBC for China compliance or AES-256-GCM
  const algorithm = keyType === 'symmetric' ? 'SM4_CBC' : 'AES_256_GCM';

  userSchema.plugin(lclCryptoPlugin, {
    keyVaultService,
    entityName: 'User',
    algorithm
  });

  const User = mongoose.model('User', userSchema);

  // 5. Use normally - encryption/decryption is transparent
  const user = new User({ name: 'Alice', phone: '13800138000' });
  await user.save();
  console.log(`Saved with Alibaba KMS (${keyType}, ${algorithm})`);

  const found = await User.findOne({ phone: '13800138000' });
  console.log('Found:', found?.name, found?.phone);

  keyVaultService.flushCache();
  await mongoose.disconnect();
}

main().catch(console.error);
