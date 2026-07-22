'use strict';

const CryptoCodec = require('./crypto/CryptoCodec');
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

// SPI layer
const StorageAdapter = require('./spi/StorageAdapter');
const DocumentAccessor = require('./spi/DocumentAccessor');
const StructuredValueCodec = require('./spi/StructuredValueCodec');
const QueryTransformer = require('./spi/QueryTransformer');
const VaultStore = require('./spi/VaultStore');
const { validateVaultDocument, createVaultDocument } = require('./spi/VaultDocument');
const OptimisticLockError = require('./spi/OptimisticLockError');

// Adapter layer
const MongoVaultStore = require('./adapter/MongoVaultStore');
const InMemoryVaultStore = require('./adapter/InMemoryVaultStore');
const MongooseStorageAdapter = require('./adapter/MongooseStorageAdapter');
const MongooseDocumentAccessor = require('./adapter/MongooseDocumentAccessor');
const BsonStructuredValueCodec = require('./adapter/BsonStructuredValueCodec');
const MongooseQueryTransformer = require('./adapter/MongooseQueryTransformer');

module.exports = {
  // Crypto
  CryptoCodec,
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

  // SPI
  StorageAdapter,
  DocumentAccessor,
  StructuredValueCodec,
  QueryTransformer,

  // Vault
  VaultStore,
  validateVaultDocument,
  createVaultDocument,
  OptimisticLockError,
  MongoVaultStore,
  InMemoryVaultStore,

  // Adapter
  MongooseStorageAdapter,
  MongooseDocumentAccessor,
  BsonStructuredValueCodec,
  MongooseQueryTransformer
};
