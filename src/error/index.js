'use strict';

const LclCryptoError = require('./LclCryptoError');
const PayloadCorruptionError = require('./PayloadCorruptionError');
const KeyResolutionError = require('./KeyResolutionError');
const CryptoAuthenticationError = require('./CryptoAuthenticationError');
const SchemaDriftError = require('./SchemaDriftError');
const UnsupportedAlgorithmError = require('./UnsupportedAlgorithmError');

module.exports = {
  LclCryptoError,
  PayloadCorruptionError,
  KeyResolutionError,
  CryptoAuthenticationError,
  SchemaDriftError,
  UnsupportedAlgorithmError
};
