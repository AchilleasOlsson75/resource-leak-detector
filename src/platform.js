/**
 * Why this file exists:
 *
 * Node 18 and 20 ship a global WeakRef and FinalizationRegistry, and so do all
 * modern browsers. However, in some embedded JS engines WeakRef is present but
 * is not writable as a property of globalThis (it lives on the global scope but
 * is shadowed in stricter module modes). Importing from here lets a consumer
 * swap the implementation in environments where the global is named differently.
 *
 * We do not currently export a way to override this; it's an internal seam so
 * the core module can be tested in isolation if a future engine diverges.
 */
export const WeakRef = globalThis.WeakRef;
export const FinalizationRegistry = globalThis.FinalizationRegistry;
