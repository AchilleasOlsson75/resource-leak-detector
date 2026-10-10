import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLeakDetector } from '../src/index.js';

test('createLeakDetector returns an object with track and detect functions', () => {
  const d = createLeakDetector();
  assert.equal(typeof d.track, 'function');
  assert.equal(typeof d.detect, 'function');
});

test('track returns the same value it was given', () => {
  const d = createLeakDetector();
  const conn = { id: 1 };
  const tracked = d.track(conn, 'Conn');
  assert.equal(tracked, conn);
});

test('track throws on non-object values', () => {
  const d = createLeakDetector();
  assert.throws(() => d.track(null, 'X'), /object or symbol/);
  assert.throws(() => d.track(42, 'Number'), /object or symbol/);
  assert.throws(() => d.track('str', 'String'), /object or symbol/);
  assert.throws(() => d.track(true, 'Bool'), /object or symbol/);
});

test('track accepts symbols', () => {
  const d = createLeakDetector();
  const s = Symbol('a');
  const tracked = d.track(s, 'Sym');
  assert.equal(tracked, s);
});

test('track rejects registered symbols', () => {
  const d = createLeakDetector();
  const s = Symbol.for('registered-symbol');
  assert.throws(() => d.track(s, 'Sym'), /registered symbol/);
});

test('track throws on empty or non-string kind', () => {
  const d = createLeakDetector();
  assert.throws(() => d.track({}, ''), /non-empty kind/);
  assert.throws(() => d.track({}, null), /non-empty kind/);
  assert.throws(() => d.track({}, 7), /non-empty kind/);
});

test('detect with no tracked resources returns empty results', () => {
  const d = createLeakDetector();
  const r = d.detect();
  assert.deepEqual(r.leaks, []);
  assert.equal(r.collected, 0);
});

test('detect reports live handles as survivors and leaks', () => {
  const d = createLeakDetector();
  const a = { id: 'a' };
  const b = { id: 'b' };
  d.track(a, 'Conn');
  d.track(b, 'Stream');
  const r = d.detect();
  assert.equal(r.leaks.length, 2);
  assert.equal(r.survivors.length, 2);
  // sort is by createdAt then kind; both have createdAt 0, so kinds sort: Conn, Stream
  assert.equal(r.leaks[0].kind, 'Conn');
  assert.equal(r.leaks[1].kind, 'Stream');
  assert.equal(r.leaks[0].value, a);
  assert.equal(r.leaks[1].value, b);
  assert.equal(r.collected, 0);
});

test('detect uses the provided clock for createdAt', () => {
  let tick = 100;
  const d = createLeakDetector({ clock: () => tick });
  const a = { id: 'a' };
  tick = 100;
  d.track(a, 'Late');
  tick = 50;
  d.track({ id: 'b' }, 'Early');
  const r = d.detect();
  assert.equal(r.leaks.length, 2);
  assert.equal(r.leaks[0].kind, 'Early');
  assert.equal(r.leaks[0].createdAt, 50);
  assert.equal(r.leaks[1].kind, 'Late');
  assert.equal(r.leaks[1].createdAt, 100);
});

test('detect is idempotent across calls when nothing is collected', () => {
  const d = createLeakDetector();
  d.track({ id: 'a' }, 'Conn');
  const r1 = d.detect();
  const r2 = d.detect();
  assert.equal(r1.leaks.length, 1);
  assert.equal(r2.leaks.length, 1);
  assert.equal(r1.collected, 0);
  assert.equal(r2.collected, 0);
});

test('multiple trackers are independent', () => {
  const d1 = createLeakDetector();
  const d2 = createLeakDetector();
  d1.track({ id: 'a' }, 'Conn');
  d2.track({ id: 'b' }, 'Conn');
  assert.equal(d1.detect().leaks.length, 1);
  assert.equal(d2.detect().leaks.length, 1);
});

test('detect returns a fresh array each call (no aliasing)', () => {
  const d = createLeakDetector();
  d.track({ id: 'a' }, 'Conn');
  const r1 = d.detect();
  const r2 = d.detect();
  assert.notEqual(r1.leaks, r2.leaks);
});
