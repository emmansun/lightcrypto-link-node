# Observability Guide

lightcrypto-link-node provides structured event emission and health check infrastructure for production monitoring, aligned with the Java `lcl-spring-boot-starter` observability module.

## Event Catalog

All events follow the naming convention: `lcl.<subsystem>.<operation>.<status>`

### Bootstrap Events

| Event | Tier | Source | Description |
|-------|------|--------|-------------|
| `lcl.bootstrap.started` | L2 | BootstrapEngine | Bootstrap sequence initiated |
| `lcl.bootstrap.{phase}.started` | L2 | BootstrapEngine | Phase (config/spi/kat/canary) started |
| `lcl.bootstrap.{phase}.completed` | L2 | BootstrapEngine | Phase completed successfully |
| `lcl.bootstrap.{phase}.failed` | L2 | BootstrapEngine | Phase failed |
| `lcl.bootstrap.{phase}.degraded` | L2 | BootstrapEngine | Phase degraded (non-fatal) |
| `lcl.bootstrap.ready` | L2 | BootstrapEngine | All phases complete |
| `lcl.bootstrap.timeout` | L2 | BootstrapEngine | Bootstrap exceeded timeout |

### Key Vault Events

| Event | Tier | Source | Attributes | Description |
|-------|------|--------|------------|-------------|
| `lcl.keyvault.init.completed` | L2 | KeyVaultService | — | Vault first created for namespace |
| `lcl.keyvault.load.completed` | L2 | KeyVaultService | activeKid, dekVersion | Keys loaded and verified into cache |
| `lcl.rotation.execute.completed` | L2 | KeyVaultService | kid | DEK rotation successful |
| `lcl.keyvault.keys.retired` | L2 | KeyVaultService | retiredKids | ROTATED→RETIRED transition |
| `lcl.keyvault.keys.pruned` | L2 | KeyVaultService | removedCount | RETIRED entries permanently removed |
| `lcl.keyvault.cache.evicted` | L1 | KeyVaultService | — | Cache flushed, key material destroyed |

### Re-wrap Events

| Event | Tier | Source | Attributes | Description |
|-------|------|--------|------------|-------------|
| `lcl.rewrap.namespace.completed` | L2 | KeyVaultService | — | Single namespace re-wrap success |
| `lcl.rewrap.namespace.failed` | L2 | KeyVaultService | errorType | Single namespace re-wrap failure |
| `lcl.rewrap.batch.completed` | L2 | KeyVaultService | totalCount, successCount, failedCount | Batch re-wrap complete |

### Re-encryption Events

| Event | Tier | Source | Attributes | Description |
|-------|------|--------|------------|-------------|
| `lcl.reencrypt.batch.completed` | L2 | DekReEncryptionService | docsProcessed, docsSkipped, docsFailed | Batch progress |
| `lcl.reencrypt.namespace.completed` | L2 | DekReEncryptionService | docsProcessed, docsSkipped, docsFailed, fieldsReEncrypted | Namespace complete |

### Decrypt Path Events

| Event | Tier | Source | Attributes | Description |
|-------|------|--------|------------|-------------|
| `lcl.decrypt.field.failed` | L1–L3 | lclCryptoPlugin | errorCode, fieldName | Field decryption failure (tier by error severity) |

## EventBus Implementations

### NoOpEventBus (default)

Zero-overhead singleton. All events silently discarded.

```javascript
const { NoOpEventBus } = require('lightcrypto-link-node');
// Used automatically when no eventBus is configured
```

### LoggingEventBus

Structured JSON output with tier-based log level mapping (aligned with Java `Slf4jEventBus`):
- **L1** (Diagnostic) → `debug`
- **L2** (Operational) → `info`
- **L3** (Audit) → `info`

```javascript
const { LoggingEventBus } = require('lightcrypto-link-node');

// Default: console output with [LCL] prefix
const bus = new LoggingEventBus();

// Custom logger (pino, winston, bunyan, etc.)
const bus = new LoggingEventBus({
  logger: { debug: (msg) => pino.debug(msg), info: (msg) => pino.info(msg) },
  prefix: '[CRYPTO]'  // or '' for no prefix
});
```

Output example:
```
[LCL] {"event":"lcl.keyvault.init.completed","tier":"L2","timestamp":"2026-07-29T10:00:00.000Z","result":"success","namespace":"default.default.User#phone"}
```

### CompositeEventBus

Multi-cast to multiple buses with failure isolation (one bus throwing doesn't affect others).

```javascript
const { CompositeEventBus, LoggingEventBus } = require('lightcrypto-link-node');

const bus = new CompositeEventBus([
  new LoggingEventBus(),
  new MyMetricsEventBus()
]);
```

### Custom EventBus

Extend the `EventBus` base class:

```javascript
const { EventBus } = require('lightcrypto-link-node');

class OtelEventBus extends EventBus {
  emit(event) {
    // Bridge to OpenTelemetry, Prometheus, Datadog, etc.
    meter.add(1, { 'lcl.event': event.event, 'lcl.tier': event.tier });
  }
}
```

## Health Module

Framework-agnostic health check infrastructure for k8s readiness/liveness probes.

### LclHealthStatus

Four-state model with severity ordering:

```
READY (0) < STARTING (1) < DEGRADED (2) < FAILED (3)
```

| Status | Meaning |
|--------|---------|
| `READY` | Fully operational |
| `STARTING` | Initialization in progress |
| `DEGRADED` | Non-critical component unavailable |
| `FAILED` | Fatal — crypto operations cannot proceed |

### ComponentHealthCheck

SPI base class for component-level checks:

```javascript
const { ComponentHealthCheck, LclHealthStatus } = require('lightcrypto-link-node');

class VaultHealthCheck extends ComponentHealthCheck {
  constructor(vaultStore) {
    super();
    this._vaultStore = vaultStore;
  }
  check() {
    return this._vaultStore.isReachable()
      ? LclHealthStatus.READY
      : LclHealthStatus.FAILED;
  }
}
```

### LclHealthCollector

Aggregates all registered checks into overall status:

```javascript
const { LclHealthCollector, LclHealthStatus } = require('lightcrypto-link-node');

const collector = new LclHealthCollector({
  vault: new VaultHealthCheck(vaultStore),
  kms: { check: () => kmsReachable ? LclHealthStatus.READY : LclHealthStatus.DEGRADED }
});

// Express / Fastify / Koa health endpoint
app.get('/healthz', (req, res) => {
  const { overall, details } = collector.collect();
  res.status(overall === 'READY' ? 200 : 503).json(details);
});
```

Response:
```json
{
  "vault": "READY",
  "kms": "READY",
  "overall": "READY",
  "sdkVersion": "1.2.0"
}
```

### k8s Probe Configuration

```yaml
readinessProbe:
  httpGet:
    path: /healthz
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 10
livenessProbe:
  httpGet:
    path: /healthz
    port: 3000
  initialDelaySeconds: 15
  periodSeconds: 30
```

## Security Constraint

LclEvent instances MUST NOT contain: IV, auth tag, ciphertext, wrapped DEK, CMK material, plaintext values, query values, or personal data. Events carry only metadata (namespace, algorithm, duration, error type).
