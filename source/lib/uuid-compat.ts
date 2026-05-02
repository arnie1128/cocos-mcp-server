// UUID compatibility layer (v2.6.0). Lifted from RomaRogov-cocos-mcp's
// McpServerManager.{encodeUuid, decodeUuid} (server-manager.ts:389-408).
//
// Cocos sub-asset UUIDs use the form `<asset-uuid>@<sub-key>` (e.g.
// `e2c52a44-9395-4dd2-8a2c-8b96bf04a8b1@texture`). Any client / proxy that
// touches the wire JSON and treats `@` specially (some URL-encoding paths,
// JSON-Pointer normalizers, query-string parsers) can mangle this format
// before it reaches our tool handlers. RomaRogov works around this by
// optionally base64-encoding `@`-containing UUIDs at the client edge and
// decoding on the server.
//
// `decodeUuid` is a **safe no-op** for all conventional UUIDs:
//   - plain UUIDs (no `@`) → returned unchanged
//   - sub-asset UUIDs in raw form (with `@`) → returned unchanged (atob
//     would not produce a string containing `@` from a non-base64 input)
//   - base64-encoded sub-asset UUIDs that decode to a string containing
//     `@` → returned decoded
//
// We deliberately apply this only at asset-DB tool entry points (asset-meta
// tools as of v2.6.0). Scene/component UUIDs never carry `@`, so applying
// the compat decode to them would be pure attack surface for false
// positives. Callers that hit `@`-mangling on other channels can wire
// `decodeUuid` at their tool's entry point as needed.

const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

// v2.6.1 review fix (claude M1 + codex 🟡): the v2.6.0 predicate "decoded
// contains @" produced false positives for any random base64-shaped string
// that happened to decode to bytes containing 0x40. Empirically ~5-7% hit
// rate at length 20/24/28. Tighten by also requiring the decoded value to
// match the cocos sub-asset UUID shape: lowercase-hex + dashes (cocos
// canonical UUID v4) followed by `@<sub-key>`. This keeps the no-op
// invariant for plain UUIDs AND for base64 strings that don't decode to
// a real sub-asset reference.
const COCOS_SUB_ASSET_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}@[\w.-]+$/i;

function isLikelyBase64(s: string): boolean {
    if (!s || s.length % 4 !== 0) return false;
    return BASE64_RE.test(s);
}

/**
 * Decode a UUID that may have been base64-encoded by a client to dodge
 * `@` mangling on the wire. Returns the input unchanged for plain UUIDs
 * AND for any base64-shaped input that doesn't decode to a recognisable
 * cocos sub-asset UUID (`<canonical-uuid>@<sub-key>`).
 *
 * Safe no-op cases verified:
 *   - plain UUID (has dashes, regex rejects) → unchanged
 *   - raw `<uuid>@<sub>` (has `@`, regex rejects) → unchanged
 *   - arbitrary base64 like `aGVsbG8=` → decoded to "hello", no `@` → unchanged
 *   - email-shaped base64 like base64("user@example.com") → contains `@`
 *     but doesn't match COCOS_SUB_ASSET_RE → unchanged (v2.6.1 tighten)
 *   - random 20/24/28-char base64 happening to contain 0x40 in decode →
 *     fails COCOS_SUB_ASSET_RE → unchanged (v2.6.1 tighten)
 */
export function decodeUuid(input: string): string {
    if (typeof input !== 'string' || input.length === 0) return input;
    if (!isLikelyBase64(input)) return input;
    try {
        const decoded = Buffer.from(input, 'base64').toString('utf8');
        if (COCOS_SUB_ASSET_RE.test(decoded)) return decoded;
    } catch {
        // ill-formed base64; fall through.
    }
    return input;
}

/**
 * Inverse of decodeUuid. Encode a UUID for transit if it contains `@`,
 * leave plain UUIDs unchanged. Provided for symmetry with RomaRogov's
 * helper; current cocos-mcp-server tools don't auto-encode outbound
 * UUIDs because we control the response shape, but a future client SDK
 * might want this when echoing UUIDs back.
 */
export function encodeUuid(input: string): string {
    if (typeof input !== 'string' || !input.includes('@')) return input;
    return Buffer.from(input, 'utf8').toString('base64');
}
