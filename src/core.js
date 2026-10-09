import { WeakRef } from './platform.js';

/**
 * Why WeakRef + FinalizationRegistry together rather than WeakRef alone:
 *
 * The user wants to know, after a GC sweep, which *classes* of resource leaked.
 * FinalizationRegistry can tell us when an object was collected (the expected
 * path) but cannot tell us when one was NOT collected. The mirror to that is
 * a WeakRef registry: we register every handle's WeakRef on creation, and on
 * a detect() sweep we walk the list. A WeakRef whose deref() returns undefined
 * was collected (good, or late but fine); a WeakRef whose deref() returns the
 * live object survived the sweep and is reported as a leak.
 *
 * We pair this with FinalizationRegistry so we can prune collected WeakRefs
 * from the list between sweeps. Without pruning the list grows without bound
 * across a long-lived process.
 */
export function createLeakDetector(options = {}) {
  const sweepClock = options.clock || null;

  // Array of { ref: WeakRef, kind: string, createdAt: number }
  const registry = [];

  // Internal counter for deterministic, insertion-order-stable sorting when
  // multiple leaks share the same createdAt timestamp. Tests rely on this so
  // that sorting does not depend on object identity hashing.
  let seq = 0;

  const finalizer = new FinalizationRegistry((token) => {
    // token is the index into registry at the time of registration. The
    // array may have had entries spliced out, so we validate the token still
    // points at a matching slot before pruning.
    if (token >= 0 && token < registry.length && registry[token] && registry[token].seq === token) {
      registry[token] = null;
    }
  });

  // Compact the registry by dropping null slots. Called at the start of every
  // detect() so the public report never exposes internal tombstones.
  function compact() {
    let write = 0;
    for (let i = 0; i < registry.length; i++) {
      const entry = registry[i];
      if (entry !== null) {
        if (write !== i) {
          registry[write] = entry;
          registry[i] = null;
          // Re-register the finalizer with the new index token.
          finalizer.register(entry.value, write, entry.value);
          entry.seq = write;
        }
        write++;
      }
    }
    registry.length = write;
  }

  /**
   * Track a value as a resource of the given kind.
   * The value must be an object or a non-registered symbol.
   * Returns the value unchanged so callers can write:
   *   const conn = detector.track(new Conn(), 'Conn');
   */
  function track(value, kind) {
    if (value === null || (typeof value !== 'object' && typeof value !== 'symbol')) {
      throw new TypeError('track() requires an object or symbol value');
    }
    if (typeof value === 'symbol' && Symbol.keyFor(value) !== undefined) {
      throw new TypeError('track() rejects registered symbols');
    }
    if (typeof kind !== 'string' || kind.length === 0) {
      throw new TypeError('track() requires a non-empty kind string');
    }

    const ref = new WeakRef(value);
    const idx = registry.length;
    const entry = {
      ref,
      kind,
      value,
      createdAt: sweepClock ? sweepClock() : 0,
      seq: idx,
    };
    registry.push(entry);
    finalizer.register(value, idx, value);
    return value;
  }

  /**
   * Run a leak sweep.
   * Returns { leaks, survivors, collected } where:
   *  - leaks: entries whose WeakRef deref() returned a live value (sorted by
   *    createdAt asc, then kind asc, for deterministic output).
   *  - survivors: same set as leaks, named for readability in tests that want
   *    to assert on the *non-leak* path (i.e. everything still alive).
   *  - collected: count of WeakRefs that deref()'d to undefined this sweep.
   *
   * Why no forced GC here: forcing a collection synchronously is not possible
   * in standard JS. detect() reports the *current* liveness state. Tests that
   * want to observe collection must call detect() across event-loop turns or
   * hooks provided by their test runner; this library does not claim to trigger
   * GC.
   */
  function detect() {
    compact();

    const leaks = [];
    let collected = 0;

    for (const entry of registry) {
      const v = entry.ref.deref();
      if (v === undefined) {
        collected++;
        continue;
      }
      leaks.push({ kind: entry.kind, createdAt: entry.createdAt, value: v });
    }

    leaks.sort((a, b) => {
      if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
      return a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0;
    });

    return { leaks, survivors: leaks, collected };
  }

  return { track, detect };
}
