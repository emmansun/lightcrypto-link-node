'use strict';

const path = require('path');
const fs = require('fs');

const KAT_DIR = path.join(__dirname, 'kat');

/**
 * Loads and parses golden KAT vector JSON files from the kat/ directory.
 */
class KatVectorLoader {
  /**
   * Load encryption vectors for a specific algorithm file.
   * @param {string} filename - e.g. 'aes-256-gcm.json'
   * @returns {Array<Object>} Array of vector objects
   */
  static loadEncryptionVectors(filename) {
    return KatVectorLoader._loadJson(filename);
  }

  /**
   * Load blind index vectors.
   * @returns {Array<Object>}
   */
  static loadBlindIndexVectors() {
    return KatVectorLoader._loadJson('blind-index.json');
  }

  /**
   * Load KCV vectors.
   * @returns {Array<Object>}
   */
  static loadKcvVectors() {
    return KatVectorLoader._loadJson('kcv.json');
  }

  /**
   * @private
   */
  static _loadJson(filename) {
    const filePath = path.join(KAT_DIR, filename);
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  }
}

module.exports = KatVectorLoader;
