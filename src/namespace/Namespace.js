'use strict';

const SEGMENT_PATTERN = /^[a-zA-Z0-9_-]+$/;
const FIELD_PATTERN = /^[a-zA-Z0-9_-]+(\.[a-zA-Z0-9_-]+)*$/;
const MAX_CANONICAL_BYTES = 256;

/**
 * Namespace model: <tenant>.<realm>.<entity>#<field>
 * Matches Java Namespace record for cross-language compatibility.
 */
class Namespace {
  /**
   * @param {string} tenant
   * @param {string} realm
   * @param {string} entity
   * @param {string} field
   */
  constructor(tenant, realm, entity, field) {
    this._tenant = tenant;
    this._realm = realm;
    this._entity = entity;
    this._field = field;
    Namespace._validate(this);
  }

  /**
   * Parse a raw namespace string.
   * Supports:
   *  - Full form: "tenant.realm.entity#field"
   *  - Shorthand: "entity#field" → default.default.entity#field
   * @param {string} raw
   * @returns {Namespace}
   */
  static parse(raw) {
    return Namespace.parseWithDefaults(raw, 'default', 'default');
  }

  /**
   * Parse a raw namespace string with custom default tenant/realm.
   * Supports:
   *  - Full form: "tenant.realm.entity#field"
   *  - Shorthand: "entity#field" → {defaultTenant}.{defaultRealm}.entity#field
   * @param {string} raw
   * @param {string} [defaultTenant='default'] - Default tenant for shorthand notation
   * @param {string} [defaultRealm='default'] - Default realm for shorthand notation
   * @returns {Namespace}
   */
  static parseWithDefaults(raw, defaultTenant = 'default', defaultRealm = 'default') {
    if (typeof raw !== 'string' || raw.length === 0) {
      throw new Error('Namespace must be a non-empty string');
    }

    const hashIdx = raw.indexOf('#');
    if (hashIdx === -1) {
      throw new Error(`Invalid namespace: missing '#' separator: "${raw}"`);
    }

    const beforeHash = raw.substring(0, hashIdx);
    const field = raw.substring(hashIdx + 1);

    const dotParts = beforeHash.split('.');

    if (dotParts.length === 1) {
      // Shorthand: "Entity#field" → use configured defaults
      return new Namespace(defaultTenant, defaultRealm, dotParts[0], field);
    } else if (dotParts.length === 2) {
      // Ambiguous: "realm.entity#field"
      throw new Error(`Ambiguous namespace: "${raw}" — use either "Entity#field" or "tenant.realm.Entity#field"`);
    } else if (dotParts.length === 3) {
      // Full: "tenant.realm.entity#field"
      return new Namespace(dotParts[0], dotParts[1], dotParts[2], field);
    } else {
      throw new Error(`Invalid namespace: too many dot segments in "${raw}"`);
    }
  }

  /**
   * Construct a Namespace from explicit segments.
   * @param {string} tenant
   * @param {string} realm
   * @param {string} entity
   * @param {string} field
   * @returns {Namespace}
   */
  static of(tenant, realm, entity, field) {
    return new Namespace(tenant, realm, entity, field);
  }

  get tenant() { return this._tenant; }
  get realm() { return this._realm; }
  get entity() { return this._entity; }
  get field() { return this._field; }

  /**
   * @returns {string} Canonical form: "tenant.realm.entity#field"
   */
  canonical() {
    return `${this._tenant}.${this._realm}.${this._entity}#${this._field}`;
  }

  /**
   * @returns {Buffer} UTF-8 bytes of the canonical form
   */
  canonicalBytes() {
    return Buffer.from(this.canonical(), 'utf8');
  }

  /**
   * Validate all segments.
   * @private
   */
  static _validate(ns) {
    const { _tenant: tenant, _realm: realm, _entity: entity, _field: field } = ns;

    if (!tenant || !realm || !entity || !field) {
      throw new Error('Namespace segments must not be empty');
    }

    if (!SEGMENT_PATTERN.test(tenant)) {
      throw new Error(`Invalid tenant segment: "${tenant}" — allowed: [a-zA-Z0-9_-]`);
    }
    if (!SEGMENT_PATTERN.test(realm)) {
      throw new Error(`Invalid realm segment: "${realm}" — allowed: [a-zA-Z0-9_-]`);
    }
    if (!SEGMENT_PATTERN.test(entity)) {
      throw new Error(`Invalid entity segment: "${entity}" — allowed: [a-zA-Z0-9_-]`);
    }
    if (!FIELD_PATTERN.test(field)) {
      throw new Error(`Invalid field segment: "${field}" — allowed: [a-zA-Z0-9_-]+(\\.[a-zA-Z0-9_-]+)*`);
    }

    const canonicalBytes = Buffer.byteLength(ns.canonical(), 'utf8');
    if (canonicalBytes > MAX_CANONICAL_BYTES) {
      throw new Error(`Namespace canonical form exceeds ${MAX_CANONICAL_BYTES} UTF-8 bytes: ${canonicalBytes}`);
    }
  }
}

module.exports = Namespace;
