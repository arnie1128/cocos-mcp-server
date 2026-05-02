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

function isLikelyBase64(s: string): boolean {
    if (!s || s.length % 4 !== 0) return false;
    return BASE64_RE.test(s);
}

/**
 * Decode a UUID that may have been base64-encoded by a client to dodge
 * `@` mangling on the wire. Returns the input unchanged for plain UUIDs.
 *
 * The decode is gated on the result containing `@` — this is what
 * distinguishes a real encoded sub-asset UUID from an arbitrary base64
 * string. So a 24-char client-id that happens to look base64-like won't
 * be silently decoded into garbage.
 */
export function decodeUuid(input: string): string {
    if (typeof input !== 'string' || input.length === 0) return input;
    if (!isLikelyBase64(input)) return input;
    try {
        // Node 16+: Buffer always; atob is also available globally on Node 18+.
        const decoded = Buffer.from(input, 'base64').toString('utf8');
        if (decoded.includes('@')) return decoded;
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
