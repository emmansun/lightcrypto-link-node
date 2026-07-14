'use strict';

const CryptoCodec = require('./crypto/CryptoCodec');
const SymmetricEncryptor = require('./crypto/SymmetricEncryptor');
const AesGcmEncryptor = require('./crypto/AesGcmEncryptor');
const AesCbcEncryptor = require('./crypto/AesCbcEncryptor');
const Sm4CbcEncryptor = require('./crypto/Sm4CbcEncryptor');

const TypeSerializer = require('./service/TypeSerializer');
const TypeDeserializer = require('./service/TypeDeserializer');
const KeyVaultService = require('./service/KeyVaultService');
const { FieldCryptoService, FatalCryptoError, DecryptionError } = require('./service/FieldCryptoService');
const ProgrammaticCryptoService = require('./service/ProgrammaticCryptoService');

const CmkProvider = require('./provider/CmkProvider');
const LocalCmkProvider = require('./provider/LocalCmkProvider');
const AzureKmsProvider = require('./provider/AzureKmsProvider');
const AlibabaKmsProvider = require('./provider/AlibabaKmsProvider');

const LclConfig = require('./config/LclConfig');
const { lclCryptoPlugin, prepareEncryptedSchema } = require('./plugin/lclCryptoPlugin');
const { rewriteQuery } = require('./plugin/queryRewriter');
const { getKeyVaultModel } = require('./model/KeyVaultDocument');

module.exports = {
  // Crypto
  CryptoCodec,
  SymmetricEncryptor,
  AesGcmEncryptor,
  AesCbcEncryptor,
  Sm4CbcEncryptor,

  // Services
  TypeSerializer,
  TypeDeserializer,
  KeyVaultService,
  FieldCryptoService,
  FatalCryptoError,
  DecryptionError,
  ProgrammaticCryptoService,

  // Providers
  CmkProvider,
  LocalCmkProvider,
  AzureKmsProvider,
  AlibabaKmsProvider,

  // Configuration
  LclConfig,

  // Plugin
  lclCryptoPlugin,
  prepareEncryptedSchema,
  rewriteQuery,

  // Model
  getKeyVaultModel
};
