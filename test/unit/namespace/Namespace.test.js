'use strict';

const Namespace = require('../../../src/namespace/Namespace');

describe('Namespace', () => {
  describe('parse()', () => {
    it('parses full four-segment form', () => {
      const ns = Namespace.parse('tenantA.app.User#phone');
      expect(ns.tenant).toBe('tenantA');
      expect(ns.realm).toBe('app');
      expect(ns.entity).toBe('User');
      expect(ns.field).toBe('phone');
      expect(ns.canonical()).toBe('tenantA.app.User#phone');
    });

    it('expands shorthand to default.default', () => {
      const ns = Namespace.parse('User#phone');
      expect(ns.tenant).toBe('default');
      expect(ns.realm).toBe('default');
      expect(ns.entity).toBe('User');
      expect(ns.field).toBe('phone');
      expect(ns.canonical()).toBe('default.default.User#phone');
    });

    it('rejects ambiguous two-segment form', () => {
      expect(() => Namespace.parse('realm.entity#field')).toThrow('Ambiguous');
    });

    it('rejects missing # separator', () => {
      expect(() => Namespace.parse('User.phone')).toThrow("missing '#'");
    });

    it('rejects empty string', () => {
      expect(() => Namespace.parse('')).toThrow();
    });
  });

  describe('of()', () => {
    it('constructs from explicit segments', () => {
      const ns = Namespace.of('t', 'r', 'E', 'f');
      expect(ns.canonical()).toBe('t.r.E#f');
    });
  });

  describe('validation', () => {
    it('accepts valid characters', () => {
      expect(() => Namespace.parse('a-b_c.d-e_f.G-h_i#j-k_l')).not.toThrow();
    });

    it('rejects invalid characters in tenant', () => {
      expect(() => Namespace.parse('te nant.realm.Entity#field')).toThrow('Invalid tenant');
    });

    it('rejects invalid characters in entity', () => {
      expect(() => Namespace.parse('tenant.realm.Ent@ity#field')).toThrow('Invalid entity');
    });

    it('allows dots in field segment', () => {
      const ns = Namespace.parse('Entity#address.street');
      expect(ns.field).toBe('address.street');
    });

    it('rejects empty segments', () => {
      expect(() => Namespace.of('', 'r', 'e', 'f')).toThrow('must not be empty');
    });

    it('rejects canonical form exceeding 256 bytes', () => {
      const longEntity = 'A'.repeat(260);
      expect(() => Namespace.of('t', 'r', longEntity, 'f')).toThrow('exceeds 256');
    });
  });

  describe('canonicalBytes()', () => {
    it('returns UTF-8 bytes of canonical form', () => {
      const ns = Namespace.parse('User#phone');
      const bytes = ns.canonicalBytes();
      expect(bytes.toString('utf8')).toBe('default.default.User#phone');
    });
  });

  describe('case sensitivity', () => {
    it('treats different cases as different namespaces', () => {
      const ns1 = Namespace.parse('User#Phone');
      const ns2 = Namespace.parse('user#phone');
      expect(ns1.canonical()).not.toBe(ns2.canonical());
    });
  });
});
