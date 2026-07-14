/* tslint:disable */
/* eslint-disable */

/**
 * Pre-load verifier params and VK from binary assets fetched by the worker,
 * so that verify_deck() needs no expensive recomputation on first call.
 */
export function load_verifier_from_bytes(params_bytes: Uint8Array, vk_bytes: Uint8Array): void;

export function poseidon2(a: Uint8Array, b: Uint8Array): Uint8Array;

export function prove_deck(cards: Uint8Array): Uint8Array;

export function prove_deck_with_salts(cards: Uint8Array, salts: Uint8Array): Uint8Array;

export function verify_deck(bundle: Uint8Array): boolean;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly load_verifier_from_bytes: (a: number, b: number, c: number, d: number) => [number, number];
    readonly poseidon2: (a: number, b: number, c: number, d: number) => [number, number];
    readonly prove_deck: (a: number, b: number) => [number, number];
    readonly prove_deck_with_salts: (a: number, b: number, c: number, d: number) => [number, number];
    readonly verify_deck: (a: number, b: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
