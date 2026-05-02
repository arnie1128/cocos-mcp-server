"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.decodeUuid = decodeUuid;
exports.encodeUuid = encodeUuid;
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;
function isLikelyBase64(s) {
    if (!s || s.length % 4 !== 0)
        return false;
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
function decodeUuid(input) {
    if (typeof input !== 'string' || input.length === 0)
        return input;
    if (!isLikelyBase64(input))
        return input;
    try {
        // Node 16+: Buffer always; atob is also available globally on Node 18+.
        const decoded = Buffer.from(input, 'base64').toString('utf8');
        if (decoded.includes('@'))
            return decoded;
    }
    catch (_a) {
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
function encodeUuid(input) {
    if (typeof input !== 'string' || !input.includes('@'))
        return input;
    return Buffer.from(input, 'utf8').toString('base64');
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXVpZC1jb21wYXQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zb3VyY2UvbGliL3V1aWQtY29tcGF0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQSx1RUFBdUU7QUFDdkUseUVBQXlFO0FBQ3pFLEVBQUU7QUFDRixvRUFBb0U7QUFDcEUsMkVBQTJFO0FBQzNFLDJFQUEyRTtBQUMzRSx5RUFBeUU7QUFDekUsc0VBQXNFO0FBQ3RFLHlFQUF5RTtBQUN6RSwwQkFBMEI7QUFDMUIsRUFBRTtBQUNGLCtEQUErRDtBQUMvRCxnREFBZ0Q7QUFDaEQsd0VBQXdFO0FBQ3hFLHlFQUF5RTtBQUN6RSx3RUFBd0U7QUFDeEUsNkJBQTZCO0FBQzdCLEVBQUU7QUFDRiw0RUFBNEU7QUFDNUUsMEVBQTBFO0FBQzFFLG1FQUFtRTtBQUNuRSxzRUFBc0U7QUFDdEUsc0RBQXNEOztBQWtCdEQsZ0NBV0M7QUFTRCxnQ0FHQztBQXZDRCxNQUFNLFNBQVMsR0FBRyx3QkFBd0IsQ0FBQztBQUUzQyxTQUFTLGNBQWMsQ0FBQyxDQUFTO0lBQzdCLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLE1BQU0sR0FBRyxDQUFDLEtBQUssQ0FBQztRQUFFLE9BQU8sS0FBSyxDQUFDO0lBQzNDLE9BQU8sU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUM3QixDQUFDO0FBRUQ7Ozs7Ozs7O0dBUUc7QUFDSCxTQUFnQixVQUFVLENBQUMsS0FBYTtJQUNwQyxJQUFJLE9BQU8sS0FBSyxLQUFLLFFBQVEsSUFBSSxLQUFLLENBQUMsTUFBTSxLQUFLLENBQUM7UUFBRSxPQUFPLEtBQUssQ0FBQztJQUNsRSxJQUFJLENBQUMsY0FBYyxDQUFDLEtBQUssQ0FBQztRQUFFLE9BQU8sS0FBSyxDQUFDO0lBQ3pDLElBQUksQ0FBQztRQUNELHdFQUF3RTtRQUN4RSxNQUFNLE9BQU8sR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssRUFBRSxRQUFRLENBQUMsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDOUQsSUFBSSxPQUFPLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQztZQUFFLE9BQU8sT0FBTyxDQUFDO0lBQzlDLENBQUM7SUFBQyxXQUFNLENBQUM7UUFDTCxtQ0FBbUM7SUFDdkMsQ0FBQztJQUNELE9BQU8sS0FBSyxDQUFDO0FBQ2pCLENBQUM7QUFFRDs7Ozs7O0dBTUc7QUFDSCxTQUFnQixVQUFVLENBQUMsS0FBYTtJQUNwQyxJQUFJLE9BQU8sS0FBSyxLQUFLLFFBQVEsSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDO1FBQUUsT0FBTyxLQUFLLENBQUM7SUFDcEUsT0FBTyxNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssRUFBRSxNQUFNLENBQUMsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLENBQUM7QUFDekQsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8vIFVVSUQgY29tcGF0aWJpbGl0eSBsYXllciAodjIuNi4wKS4gTGlmdGVkIGZyb20gUm9tYVJvZ292LWNvY29zLW1jcCdzXG4vLyBNY3BTZXJ2ZXJNYW5hZ2VyLntlbmNvZGVVdWlkLCBkZWNvZGVVdWlkfSAoc2VydmVyLW1hbmFnZXIudHM6Mzg5LTQwOCkuXG4vL1xuLy8gQ29jb3Mgc3ViLWFzc2V0IFVVSURzIHVzZSB0aGUgZm9ybSBgPGFzc2V0LXV1aWQ+QDxzdWIta2V5PmAgKGUuZy5cbi8vIGBlMmM1MmE0NC05Mzk1LTRkZDItOGEyYy04Yjk2YmYwNGE4YjFAdGV4dHVyZWApLiBBbnkgY2xpZW50IC8gcHJveHkgdGhhdFxuLy8gdG91Y2hlcyB0aGUgd2lyZSBKU09OIGFuZCB0cmVhdHMgYEBgIHNwZWNpYWxseSAoc29tZSBVUkwtZW5jb2RpbmcgcGF0aHMsXG4vLyBKU09OLVBvaW50ZXIgbm9ybWFsaXplcnMsIHF1ZXJ5LXN0cmluZyBwYXJzZXJzKSBjYW4gbWFuZ2xlIHRoaXMgZm9ybWF0XG4vLyBiZWZvcmUgaXQgcmVhY2hlcyBvdXIgdG9vbCBoYW5kbGVycy4gUm9tYVJvZ292IHdvcmtzIGFyb3VuZCB0aGlzIGJ5XG4vLyBvcHRpb25hbGx5IGJhc2U2NC1lbmNvZGluZyBgQGAtY29udGFpbmluZyBVVUlEcyBhdCB0aGUgY2xpZW50IGVkZ2UgYW5kXG4vLyBkZWNvZGluZyBvbiB0aGUgc2VydmVyLlxuLy9cbi8vIGBkZWNvZGVVdWlkYCBpcyBhICoqc2FmZSBuby1vcCoqIGZvciBhbGwgY29udmVudGlvbmFsIFVVSURzOlxuLy8gICAtIHBsYWluIFVVSURzIChubyBgQGApIOKGkiByZXR1cm5lZCB1bmNoYW5nZWRcbi8vICAgLSBzdWItYXNzZXQgVVVJRHMgaW4gcmF3IGZvcm0gKHdpdGggYEBgKSDihpIgcmV0dXJuZWQgdW5jaGFuZ2VkIChhdG9iXG4vLyAgICAgd291bGQgbm90IHByb2R1Y2UgYSBzdHJpbmcgY29udGFpbmluZyBgQGAgZnJvbSBhIG5vbi1iYXNlNjQgaW5wdXQpXG4vLyAgIC0gYmFzZTY0LWVuY29kZWQgc3ViLWFzc2V0IFVVSURzIHRoYXQgZGVjb2RlIHRvIGEgc3RyaW5nIGNvbnRhaW5pbmdcbi8vICAgICBgQGAg4oaSIHJldHVybmVkIGRlY29kZWRcbi8vXG4vLyBXZSBkZWxpYmVyYXRlbHkgYXBwbHkgdGhpcyBvbmx5IGF0IGFzc2V0LURCIHRvb2wgZW50cnkgcG9pbnRzIChhc3NldC1tZXRhXG4vLyB0b29scyBhcyBvZiB2Mi42LjApLiBTY2VuZS9jb21wb25lbnQgVVVJRHMgbmV2ZXIgY2FycnkgYEBgLCBzbyBhcHBseWluZ1xuLy8gdGhlIGNvbXBhdCBkZWNvZGUgdG8gdGhlbSB3b3VsZCBiZSBwdXJlIGF0dGFjayBzdXJmYWNlIGZvciBmYWxzZVxuLy8gcG9zaXRpdmVzLiBDYWxsZXJzIHRoYXQgaGl0IGBAYC1tYW5nbGluZyBvbiBvdGhlciBjaGFubmVscyBjYW4gd2lyZVxuLy8gYGRlY29kZVV1aWRgIGF0IHRoZWlyIHRvb2wncyBlbnRyeSBwb2ludCBhcyBuZWVkZWQuXG5cbmNvbnN0IEJBU0U2NF9SRSA9IC9eW0EtWmEtejAtOSsvXSs9ezAsMn0kLztcblxuZnVuY3Rpb24gaXNMaWtlbHlCYXNlNjQoczogc3RyaW5nKTogYm9vbGVhbiB7XG4gICAgaWYgKCFzIHx8IHMubGVuZ3RoICUgNCAhPT0gMCkgcmV0dXJuIGZhbHNlO1xuICAgIHJldHVybiBCQVNFNjRfUkUudGVzdChzKTtcbn1cblxuLyoqXG4gKiBEZWNvZGUgYSBVVUlEIHRoYXQgbWF5IGhhdmUgYmVlbiBiYXNlNjQtZW5jb2RlZCBieSBhIGNsaWVudCB0byBkb2RnZVxuICogYEBgIG1hbmdsaW5nIG9uIHRoZSB3aXJlLiBSZXR1cm5zIHRoZSBpbnB1dCB1bmNoYW5nZWQgZm9yIHBsYWluIFVVSURzLlxuICpcbiAqIFRoZSBkZWNvZGUgaXMgZ2F0ZWQgb24gdGhlIHJlc3VsdCBjb250YWluaW5nIGBAYCDigJQgdGhpcyBpcyB3aGF0XG4gKiBkaXN0aW5ndWlzaGVzIGEgcmVhbCBlbmNvZGVkIHN1Yi1hc3NldCBVVUlEIGZyb20gYW4gYXJiaXRyYXJ5IGJhc2U2NFxuICogc3RyaW5nLiBTbyBhIDI0LWNoYXIgY2xpZW50LWlkIHRoYXQgaGFwcGVucyB0byBsb29rIGJhc2U2NC1saWtlIHdvbid0XG4gKiBiZSBzaWxlbnRseSBkZWNvZGVkIGludG8gZ2FyYmFnZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGRlY29kZVV1aWQoaW5wdXQ6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgaWYgKHR5cGVvZiBpbnB1dCAhPT0gJ3N0cmluZycgfHwgaW5wdXQubGVuZ3RoID09PSAwKSByZXR1cm4gaW5wdXQ7XG4gICAgaWYgKCFpc0xpa2VseUJhc2U2NChpbnB1dCkpIHJldHVybiBpbnB1dDtcbiAgICB0cnkge1xuICAgICAgICAvLyBOb2RlIDE2KzogQnVmZmVyIGFsd2F5czsgYXRvYiBpcyBhbHNvIGF2YWlsYWJsZSBnbG9iYWxseSBvbiBOb2RlIDE4Ky5cbiAgICAgICAgY29uc3QgZGVjb2RlZCA9IEJ1ZmZlci5mcm9tKGlucHV0LCAnYmFzZTY0JykudG9TdHJpbmcoJ3V0ZjgnKTtcbiAgICAgICAgaWYgKGRlY29kZWQuaW5jbHVkZXMoJ0AnKSkgcmV0dXJuIGRlY29kZWQ7XG4gICAgfSBjYXRjaCB7XG4gICAgICAgIC8vIGlsbC1mb3JtZWQgYmFzZTY0OyBmYWxsIHRocm91Z2guXG4gICAgfVxuICAgIHJldHVybiBpbnB1dDtcbn1cblxuLyoqXG4gKiBJbnZlcnNlIG9mIGRlY29kZVV1aWQuIEVuY29kZSBhIFVVSUQgZm9yIHRyYW5zaXQgaWYgaXQgY29udGFpbnMgYEBgLFxuICogbGVhdmUgcGxhaW4gVVVJRHMgdW5jaGFuZ2VkLiBQcm92aWRlZCBmb3Igc3ltbWV0cnkgd2l0aCBSb21hUm9nb3Ync1xuICogaGVscGVyOyBjdXJyZW50IGNvY29zLW1jcC1zZXJ2ZXIgdG9vbHMgZG9uJ3QgYXV0by1lbmNvZGUgb3V0Ym91bmRcbiAqIFVVSURzIGJlY2F1c2Ugd2UgY29udHJvbCB0aGUgcmVzcG9uc2Ugc2hhcGUsIGJ1dCBhIGZ1dHVyZSBjbGllbnQgU0RLXG4gKiBtaWdodCB3YW50IHRoaXMgd2hlbiBlY2hvaW5nIFVVSURzIGJhY2suXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBlbmNvZGVVdWlkKGlucHV0OiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIGlmICh0eXBlb2YgaW5wdXQgIT09ICdzdHJpbmcnIHx8ICFpbnB1dC5pbmNsdWRlcygnQCcpKSByZXR1cm4gaW5wdXQ7XG4gICAgcmV0dXJuIEJ1ZmZlci5mcm9tKGlucHV0LCAndXRmOCcpLnRvU3RyaW5nKCdiYXNlNjQnKTtcbn1cbiJdfQ==