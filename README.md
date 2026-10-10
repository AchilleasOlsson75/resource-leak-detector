# Resource Leak Detector

A small, zero-dependency TypeScript library that wraps resource creation in WeakRef-tracked guards and reports handles that survive garbage-collection sweeps.

## Usage

```typescript
import { createLeakDetector } from './src/index.js';

class Connection {}

const detector = createLeakDetector();

const conn = detector.track(new Connection(), 'Connection');
// ... use conn ...

const report = detector.detect();
console.log(report.leaks); // [{ kind: 'Connection', createdAt: 0, value: <Connection> }]
```

## Why

Finding a leaked resource is hard because the leak only becomes visible after the runtime reclaims memory. This library takes the mirror approach: every tracked resource is held by a WeakRef and registered with a FinalizationRegistry. A `detect()` sweep walks the weak references and reports any handle whose referent is still alive.

The trade-off is that `detect()` cannot force a garbage collection (the language provides no synchronous hook for that). It reports the *current* liveness state. If a resource has already been collected by the time of the sweep, it shows up in `collected` rather than `leaks`. To observe the collected path in tests, call `detect()` across separate event-loop turns or hook your test runner's GC probe — this library does not claim to trigger collection.

## Edge Cases

- `track()` accepts objects and symbols. Registered symbols (those created with `Symbol.for`) are rejected, because they are held by the symbol registry forever and would always look leaked.
- The leak list is sorted by `createdAt` ascending, then by `kind` ascending, so output is deterministic across runs. Pass a `clock` function to the constructor if you need to control `createdAt` in tests.
- Each `detect()` call compacts the internal registry first, pruning entries whose referents were collected since the last sweep. A `detect()` run is therefore O(n) in the number of currently-tracked resources.

## Exports

- `createLeakDetector(options?: { clock?: () => number }): { track, detect }`
  - `track<T>(value: T, kind: string): T`
  - `detect(): { leaks: Array<{ kind: string, createdAt: number, value: unknown }>, survivors: Array<...>, collected: number }`
