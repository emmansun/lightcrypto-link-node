'use strict';

const CryptoCodec = require('./crypto/CryptoCodec');
const BsonCodec = require('./crypto/BsonCodec');
const SymmetricEncryptor = require('./crypto/SymmetricEncryptor');
const AesGcmEncryptor = require('./crypto/AesGcmEncryptor');
const AesCbcEncryptor = require('./crypto/AesCbcEncryptor');
const Sm4CbcEncryptor = require('./crypto/Sm4CbcEncryptor');

// Format layer
const { AlgorithmId, fromName, fromByte } = require('./format/AlgorithmId');
const WireFormatEncoder = require('./format/WireFormatEncoder');
const WireFormatDecoder = require('./format/WireFormatDecoder');

// Namespace
const Namespace = require('./namespace/Namespace');

// Blind Index
const BlindIndexEngine = require('./blindindex/BlindIndexEngine');

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
  BsonCodec,
  SymmetricEncryptor,
  AesGcmEncryptor,
  AesCbcEncryptor,
  Sm4CbcEncryptor,

  // Format
  AlgorithmId,
  fromName,
  fromByte,
  WireFormatEncoder,
  WireFormatDecoder,

  // Namespace
  Namespace,

  // Blind Index
  BlindIndexEngine,

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
