'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Default configuration values.
 */
const DEFAULTS = {
  algorithm: 'AES_256_GCM',
  cacheTtl: 3600000, // 1 hour in ms
  keyVaultCollection: '__lcl_keyvault',
  cmkProvider: 'local-symmetric',
  tenant: 'default',
  realm: 'default'
};

/**
 * LclConfig - Multi-source configuration loader with precedence hierarchy.
 *
 * Configuration sources (highest to lowest priority):
 * 1. Environment variables: LCL_CMK_KEY, LCL_MONGODB_URI, LCL_ALGORITHM, LCL_CACHE_TTL
 * 2. Secret management: Kubernetes Secrets, AWS Secrets Manager, Azure Key Vault Secrets, HashiCorp Vault
 * 3. Configuration files: .env.local, .env.production, config/lcl.json
 * 4. Application defaults
 */
class LclConfig {
  constructor() {
    this._config = {};
    this._sources = [];
    this._previousCmk = null;
    this._loaded = false;
  }

  /**
   * Load configuration from all sources in precedence order.
   * @returns {Promise<LclConfig>}
   */
  async load() {
    this._config = { ...DEFAULTS };
    this._sources = [];

    // 4. Defaults (already applied)
    this._sources.push('defaults');

    // 3. Configuration files (lowest priority after defaults)
    this._loadConfigFiles();

    // 2. Secret management
    await this._loadSecretManagers();

    // 1. Environment variables (highest priority)
    this._loadEnvVars();

    // Validate
    this._validate();

    this._previousCmk = this._config.cmkKey;
    this._loaded = true;

    // Log sources
    this._logSources();

    return this;
  }

  /**
   * Reload configuration from all sources.
   * @returns {Promise<{cmkChanged: boolean, uriChanged: boolean}>}
   */
  async reload() {
    const oldCmk = this._config.cmkKey;
    const oldUri = this._config.mongodbUri;

    await this.load();

    return {
      cmkChanged: this._config.cmkKey !== oldCmk,
      uriChanged: this._config.mongodbUri !== oldUri
    };
  }

  /** Get the CMK key (hex string). */
  get cmkKey() { return this._config.cmkKey; }

  /** Get the MongoDB URI. */
  get mongodbUri() { return this._config.mongodbUri; }

  /** Get the encryption algorithm. */
  get algorithm() { return this._config.algorithm; }

  /** Get the cache TTL in milliseconds. */
  get cacheTtl() { return this._config.cacheTtl; }

  /** Get the key vault collection name. */
  get keyVaultCollection() { return this._config.keyVaultCollection; }

  /** Get the CMK provider type. */
  get cmkProvider() { return this._config.cmkProvider; }

  /** Get the tenant identifier for namespace construction. */
  get tenant() { return this._config.tenant; }

  /** Get the realm identifier for namespace construction. */
  get realm() { return this._config.realm; }

  /** Get Azure Key Vault URL. */
  get azureKeyUrl() { return this._config.azureKeyUrl; }

  /** Get Alibaba KMS config. */
  get alibabaConfig() {
    return {
      keyId: this._config.alibabaKeyId,
      region: this._config.alibabaRegion,
      endpoint: this._config.alibabaEndpoint,
      accessKeyId: this._config.alibabaAccessKeyId,
      accessKeySecret: this._config.alibabaAccessKeySecret
    };
  }

  /** Get the raw config object. */
  get raw() { return { ...this._config }; }

  /**
   * Load configuration from files based on NODE_ENV.
   * @private
   */
  _loadConfigFiles() {
    const env = process.env.NODE_ENV || 'development';
    const configDir = path.resolve(process.cwd(), 'config');

    // Try JSON config files
    const jsonFiles = [
      path.join(configDir, 'lcl.json'),
      path.join(configDir, `lcl.${env}.json`)
    ];

    for (const filePath of jsonFiles) {
      this._loadJsonConfig(filePath);
    }

    // Try .env files
    const envFiles = [];
    if (env === 'development') envFiles.push('.env.local');
    else if (env === 'production') envFiles.push('.env.production');
    else if (env === 'test') envFiles.push('.env.test');

    for (const envFile of envFiles) {
      this._loadEnvFile(path.resolve(process.cwd(), envFile));
    }
  }

  /**
   * Load a JSON config file and merge into config.
   * @param {string} filePath
   * @private
   */
  _loadJsonConfig(filePath) {
    try {
      if (!fs.existsSync(filePath)) return;
      const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const lcl = content.lcl || content;

      if (lcl.crypto) {
        if (lcl.crypto.cmk) this._config.cmkKey = lcl.crypto.cmk;
        if (lcl.crypto.algorithm) this._config.algorithm = lcl.crypto.algorithm;
      }
      if (lcl.mongodb) {
        if (lcl.mongodb.uri) this._config.mongodbUri = lcl.mongodb.uri;
      }
      if (lcl.cmk) {
        if (lcl.cmk.provider) this._config.cmkProvider = lcl.cmk.provider;
        if (lcl.cmk.azure) {
          if (lcl.cmk.azure.keyUrl) this._config.azureKeyUrl = lcl.cmk.azure.keyUrl;
        }
      }
      if (lcl.cacheTtl !== undefined) this._config.cacheTtl = lcl.cacheTtl;

      this._sources.push(`file:${filePath}`);
    } catch (e) {
      // Silently ignore missing/invalid config files
    }
  }

  /**
   * Load .env file using dotenv (optional dependency).
   * @param {string} filePath
   * @private
   */
  _loadEnvFile(filePath) {
    try {
      const dotenv = require('dotenv');
      const result = dotenv.config({ path: filePath });
      if (!result.error) {
        this._sources.push(`env-file:${filePath}`);
      }
    } catch (e) {
      // dotenv not available, try manual parsing
      try {
        if (!fs.existsSync(filePath)) return;
        const content = fs.readFileSync(filePath, 'utf8');
        for (const line of content.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eqIndex = trimmed.indexOf('=');
          if (eqIndex === -1) continue;
          const key = trimmed.substring(0, eqIndex).trim();
          let value = trimmed.substring(eqIndex + 1).trim();
          // Remove surrounding quotes
          if ((value.startsWith('"') && value.endsWith('"')) ||
              (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }
          process.env[key] = value;
        }
        this._sources.push(`env-file:${filePath}`);
      } catch (e2) {
        // Silently ignore
      }
    }
  }

  /**
   * Load secrets from secret management systems.
   * @private
   */
  async _loadSecretManagers() {
    // Kubernetes Secrets
    await this._loadKubernetesSecrets();

    // AWS Secrets Manager
    if (process.env.LCL_AWS_SECRET_ID) {
      await this._loadAwsSecrets();
    }

    // Azure Key Vault Secrets
    if (process.env.LCL_AZURE_SECRET_URL) {
      await this._loadAzureSecrets();
    }

    // HashiCorp Vault
    if (process.env.LCL_VAULT_ADDR && process.env.LCL_VAULT_TOKEN) {
      await this._loadHashiCorpVault();
    }
  }

  /**
   * Load Kubernetes Secrets from mounted volume.
   * @private
   */
  async _loadKubernetesSecrets() {
    const secretDir = process.env.LCL_K8S_SECRET_DIR || '/var/run/secrets/lightcrypto-link';
    try {
      const cmkFile = path.join(secretDir, 'cmk-key');
      if (fs.existsSync(cmkFile)) {
        this._config.cmkKey = fs.readFileSync(cmkFile, 'utf8').trim();
        this._sources.push('kubernetes-secrets');
      }

      const uriFile = path.join(secretDir, 'mongodb-uri');
      if (fs.existsSync(uriFile)) {
        this._config.mongodbUri = fs.readFileSync(uriFile, 'utf8').trim();
      }
    } catch (e) {
      // Not running in Kubernetes, skip
    }
  }

  /**
   * Load secrets from AWS Secrets Manager.
   * @private
   */
  async _loadAwsSecrets() {
    try {
      const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
      const client = new SecretsManagerClient({});
      const command = new GetSecretValueCommand({ SecretId: process.env.LCL_AWS_SECRET_ID });
      const response = await client.send(command);
      const secrets = JSON.parse(response.SecretString);

      if (secrets.cmkKey) this._config.cmkKey = secrets.cmkKey;
      if (secrets.mongodbUri) this._config.mongodbUri = secrets.mongodbUri;
      if (secrets.azureKeyUrl) this._config.azureKeyUrl = secrets.azureKeyUrl;

      this._sources.push('aws-secrets-manager');
    } catch (e) {
      throw new Error(`Failed to load secrets from AWS Secrets Manager: ${e.message}`);
    }
  }

  /**
   * Load secrets from Azure Key Vault.
   * @private
   */
  async _loadAzureSecrets() {
    try {
      const { SecretClient } = require('@azure/keyvault-secrets');
      const { DefaultAzureCredential } = require('@azure/identity');

      const credential = new DefaultAzureCredential();
      const client = new SecretClient(process.env.LCL_AZURE_SECRET_URL, credential);

      const cmkSecret = await client.getSecret('cmk-key');
      if (cmkSecret.value) this._config.cmkKey = cmkSecret.value;

      const uriSecret = await client.getSecret('mongodb-uri');
      if (uriSecret.value) this._config.mongodbUri = uriSecret.value;

      this._sources.push('azure-keyvault-secrets');
    } catch (e) {
      throw new Error(`Failed to load secrets from Azure Key Vault: ${e.message}`);
    }
  }

  /**
   * Load secrets from HashiCorp Vault.
   * @private
   */
  async _loadHashiCorpVault() {
    try {
      const vaultPath = process.env.LCL_VAULT_PATH || 'secret/data/lightcrypto-link';
      const response = await fetch(`${process.env.LCL_VAULT_ADDR}/v1/${vaultPath}`, {
        headers: { 'X-Vault-Token': process.env.LCL_VAULT_TOKEN }
      });

      if (!response.ok) {
        throw new Error(`Vault responded with status ${response.status}`);
      }

      const data = await response.json();
      const secrets = data.data?.data || data.data || {};

      if (secrets.cmkKey) this._config.cmkKey = secrets.cmkKey;
      if (secrets.mongodbUri) this._config.mongodbUri = secrets.mongodbUri;

      this._sources.push('hashicorp-vault');
    } catch (e) {
      throw new Error(`Failed to load secrets from HashiCorp Vault: ${e.message}`);
    }
  }

  /**
   * Load configuration from environment variables.
   * @private
   */
  _loadEnvVars() {
    if (process.env.LCL_CMK_KEY) {
      this._config.cmkKey = process.env.LCL_CMK_KEY;
    }
    if (process.env.LCL_MONGODB_URI) {
      this._config.mongodbUri = process.env.LCL_MONGODB_URI;
    }
    if (process.env.LCL_ALGORITHM) {
      this._config.algorithm = process.env.LCL_ALGORITHM;
    }
    if (process.env.LCL_CACHE_TTL) {
      this._config.cacheTtl = parseInt(process.env.LCL_CACHE_TTL, 10);
    }
    if (process.env.LCL_CMK_PROVIDER) {
      this._config.cmkProvider = process.env.LCL_CMK_PROVIDER;
    }
    if (process.env.LCL_TENANT) {
      this._config.tenant = process.env.LCL_TENANT;
    }
    if (process.env.LCL_REALM) {
      this._config.realm = process.env.LCL_REALM;
    }

    if (this._sources.indexOf('environment') === -1) {
      this._sources.push('environment');
    }
  }

  /**
   * Validate configuration values.
   * @private
   */
  _validate() {
    // Validate CMK key format for local provider
    if (this._config.cmkProvider === 'local-symmetric' && this._config.cmkKey) {
      if (!/^[0-9a-fA-F]{64}$/.test(this._config.cmkKey)) {
        throw new Error(
          `Configuration validation error: CMK must be exactly 64 hex characters (32 bytes). ` +
          `Got ${this._config.cmkKey.length} characters. Check LCL_CMK_KEY environment variable.`
        );
      }
    }

    // Validate algorithm
    const validAlgorithms = ['AES_256_GCM', 'AES_256_CBC', 'SM4_CBC', 'SM4_GCM'];
    if (!validAlgorithms.includes(this._config.algorithm)) {
      throw new Error(
        `Configuration validation error: Unsupported algorithm "${this._config.algorithm}". ` +
        `Valid options: ${validAlgorithms.join(', ')}`
      );
    }

    // SM4_GCM not yet supported
    if (this._config.algorithm === 'SM4_GCM') {
      throw new Error('SM4_GCM is not yet supported. Requires OpenSSL 3.3+. Use AES_256_GCM instead.');
    }

    // Validate cache TTL
    if (isNaN(this._config.cacheTtl) || this._config.cacheTtl < 0) {
      throw new Error('Configuration validation error: Cache TTL must be a non-negative number.');
    }
  }

  /**
   * Log configuration sources (masking secrets).
   * @private
   */
  _logSources() {
    const masked = {
      sources: this._sources,
      algorithm: this._config.algorithm,
      cacheTtl: this._config.cacheTtl,
      keyVaultCollection: this._config.keyVaultCollection,
      cmkProvider: this._config.cmkProvider,
      cmkKey: this._config.cmkKey ? '****' : '(not set)',
      mongodbUri: this._config.mongodbUri ? '****' : '(not set)'
    };
    // Only log at INFO level (console.info)
    console.info(`[LCL] Loaded configuration from: [${this._sources.join(', ')}]`);
  }
}

module.exports = LclConfig;
