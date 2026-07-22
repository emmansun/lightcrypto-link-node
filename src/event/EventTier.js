'use strict';

/**
 * Event tier classification constants.
 * Aligned with Java lcl-core EventTier enum.
 */
const EventTier = Object.freeze({
  /** L1 — Diagnostic, best-effort delivery (e.g., cache eviction) */
  L1: 'L1',
  /** L2 — Operational, reliable delivery for monitoring (e.g., encrypt/decrypt/rotation) */
  L2: 'L2',
  /** L3 — Audit, guaranteed delivery for compliance */
  L3: 'L3'
});

module.exports = EventTier;
