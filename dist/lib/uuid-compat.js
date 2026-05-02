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
// v2.6.1 review fix (claude M1 + codex 🟡): the v2.6.0 predicate "decoded
// contains @" produced false positives for any random base64-shaped string
// that happened to decode to bytes containing 0x40. Empirically ~5-7% hit
// rate at length 20/24/28. Tighten by also requiring the decoded value to
// match the cocos sub-asset UUID shape: lowercase-hex + dashes (cocos
// canonical UUID v4) followed by `@<sub-key>`. This keeps the no-op
// invariant for plain UUIDs AND for base64 strings that don't decode to
// a real sub-asset reference.
const COCOS_SUB_ASSET_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}@[\w.-]+$/i;
function isLikelyBase64(s) {
    if (!s || s.length % 4 !== 0)
        return false;
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
function decodeUuid(input) {
    if (typeof input !== 'string' || input.length === 0)
        return input;
    if (!isLikelyBase64(input))
        return input;
    try {
        const decoded = Buffer.from(input, 'base64').toString('utf8');
        if (COCOS_SUB_ASSET_RE.test(decoded))
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXVpZC1jb21wYXQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zb3VyY2UvbGliL3V1aWQtY29tcGF0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQSx1RUFBdUU7QUFDdkUseUVBQXlFO0FBQ3pFLEVBQUU7QUFDRixvRUFBb0U7QUFDcEUsMkVBQTJFO0FBQzNFLDJFQUEyRTtBQUMzRSx5RUFBeUU7QUFDekUsc0VBQXNFO0FBQ3RFLHlFQUF5RTtBQUN6RSwwQkFBMEI7QUFDMUIsRUFBRTtBQUNGLCtEQUErRDtBQUMvRCxnREFBZ0Q7QUFDaEQsd0VBQXdFO0FBQ3hFLHlFQUF5RTtBQUN6RSx3RUFBd0U7QUFDeEUsNkJBQTZCO0FBQzdCLEVBQUU7QUFDRiw0RUFBNEU7QUFDNUUsMEVBQTBFO0FBQzFFLG1FQUFtRTtBQUNuRSxzRUFBc0U7QUFDdEUsc0RBQXNEOztBQWtDdEQsZ0NBVUM7QUFTRCxnQ0FHQztBQXRERCxNQUFNLFNBQVMsR0FBRyx3QkFBd0IsQ0FBQztBQUUzQywwRUFBMEU7QUFDMUUsMkVBQTJFO0FBQzNFLDBFQUEwRTtBQUMxRSwwRUFBMEU7QUFDMUUsc0VBQXNFO0FBQ3RFLG9FQUFvRTtBQUNwRSx3RUFBd0U7QUFDeEUsOEJBQThCO0FBQzlCLE1BQU0sa0JBQWtCLEdBQUcseUVBQXlFLENBQUM7QUFFckcsU0FBUyxjQUFjLENBQUMsQ0FBUztJQUM3QixJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxLQUFLLENBQUM7UUFBRSxPQUFPLEtBQUssQ0FBQztJQUMzQyxPQUFPLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDN0IsQ0FBQztBQUVEOzs7Ozs7Ozs7Ozs7OztHQWNHO0FBQ0gsU0FBZ0IsVUFBVSxDQUFDLEtBQWE7SUFDcEMsSUFBSSxPQUFPLEtBQUssS0FBSyxRQUFRLElBQUksS0FBSyxDQUFDLE1BQU0sS0FBSyxDQUFDO1FBQUUsT0FBTyxLQUFLLENBQUM7SUFDbEUsSUFBSSxDQUFDLGNBQWMsQ0FBQyxLQUFLLENBQUM7UUFBRSxPQUFPLEtBQUssQ0FBQztJQUN6QyxJQUFJLENBQUM7UUFDRCxNQUFNLE9BQU8sR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssRUFBRSxRQUFRLENBQUMsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDOUQsSUFBSSxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDO1lBQUUsT0FBTyxPQUFPLENBQUM7SUFDekQsQ0FBQztJQUFDLFdBQU0sQ0FBQztRQUNMLG1DQUFtQztJQUN2QyxDQUFDO0lBQ0QsT0FBTyxLQUFLLENBQUM7QUFDakIsQ0FBQztBQUVEOzs7Ozs7R0FNRztBQUNILFNBQWdCLFVBQVUsQ0FBQyxLQUFhO0lBQ3BDLElBQUksT0FBTyxLQUFLLEtBQUssUUFBUSxJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUM7UUFBRSxPQUFPLEtBQUssQ0FBQztJQUNwRSxPQUFPLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLE1BQU0sQ0FBQyxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsQ0FBQztBQUN6RCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLy8gVVVJRCBjb21wYXRpYmlsaXR5IGxheWVyICh2Mi42LjApLiBMaWZ0ZWQgZnJvbSBSb21hUm9nb3YtY29jb3MtbWNwJ3Ncbi8vIE1jcFNlcnZlck1hbmFnZXIue2VuY29kZVV1aWQsIGRlY29kZVV1aWR9IChzZXJ2ZXItbWFuYWdlci50czozODktNDA4KS5cbi8vXG4vLyBDb2NvcyBzdWItYXNzZXQgVVVJRHMgdXNlIHRoZSBmb3JtIGA8YXNzZXQtdXVpZD5APHN1Yi1rZXk+YCAoZS5nLlxuLy8gYGUyYzUyYTQ0LTkzOTUtNGRkMi04YTJjLThiOTZiZjA0YThiMUB0ZXh0dXJlYCkuIEFueSBjbGllbnQgLyBwcm94eSB0aGF0XG4vLyB0b3VjaGVzIHRoZSB3aXJlIEpTT04gYW5kIHRyZWF0cyBgQGAgc3BlY2lhbGx5IChzb21lIFVSTC1lbmNvZGluZyBwYXRocyxcbi8vIEpTT04tUG9pbnRlciBub3JtYWxpemVycywgcXVlcnktc3RyaW5nIHBhcnNlcnMpIGNhbiBtYW5nbGUgdGhpcyBmb3JtYXRcbi8vIGJlZm9yZSBpdCByZWFjaGVzIG91ciB0b29sIGhhbmRsZXJzLiBSb21hUm9nb3Ygd29ya3MgYXJvdW5kIHRoaXMgYnlcbi8vIG9wdGlvbmFsbHkgYmFzZTY0LWVuY29kaW5nIGBAYC1jb250YWluaW5nIFVVSURzIGF0IHRoZSBjbGllbnQgZWRnZSBhbmRcbi8vIGRlY29kaW5nIG9uIHRoZSBzZXJ2ZXIuXG4vL1xuLy8gYGRlY29kZVV1aWRgIGlzIGEgKipzYWZlIG5vLW9wKiogZm9yIGFsbCBjb252ZW50aW9uYWwgVVVJRHM6XG4vLyAgIC0gcGxhaW4gVVVJRHMgKG5vIGBAYCkg4oaSIHJldHVybmVkIHVuY2hhbmdlZFxuLy8gICAtIHN1Yi1hc3NldCBVVUlEcyBpbiByYXcgZm9ybSAod2l0aCBgQGApIOKGkiByZXR1cm5lZCB1bmNoYW5nZWQgKGF0b2Jcbi8vICAgICB3b3VsZCBub3QgcHJvZHVjZSBhIHN0cmluZyBjb250YWluaW5nIGBAYCBmcm9tIGEgbm9uLWJhc2U2NCBpbnB1dClcbi8vICAgLSBiYXNlNjQtZW5jb2RlZCBzdWItYXNzZXQgVVVJRHMgdGhhdCBkZWNvZGUgdG8gYSBzdHJpbmcgY29udGFpbmluZ1xuLy8gICAgIGBAYCDihpIgcmV0dXJuZWQgZGVjb2RlZFxuLy9cbi8vIFdlIGRlbGliZXJhdGVseSBhcHBseSB0aGlzIG9ubHkgYXQgYXNzZXQtREIgdG9vbCBlbnRyeSBwb2ludHMgKGFzc2V0LW1ldGFcbi8vIHRvb2xzIGFzIG9mIHYyLjYuMCkuIFNjZW5lL2NvbXBvbmVudCBVVUlEcyBuZXZlciBjYXJyeSBgQGAsIHNvIGFwcGx5aW5nXG4vLyB0aGUgY29tcGF0IGRlY29kZSB0byB0aGVtIHdvdWxkIGJlIHB1cmUgYXR0YWNrIHN1cmZhY2UgZm9yIGZhbHNlXG4vLyBwb3NpdGl2ZXMuIENhbGxlcnMgdGhhdCBoaXQgYEBgLW1hbmdsaW5nIG9uIG90aGVyIGNoYW5uZWxzIGNhbiB3aXJlXG4vLyBgZGVjb2RlVXVpZGAgYXQgdGhlaXIgdG9vbCdzIGVudHJ5IHBvaW50IGFzIG5lZWRlZC5cblxuY29uc3QgQkFTRTY0X1JFID0gL15bQS1aYS16MC05Ky9dKz17MCwyfSQvO1xuXG4vLyB2Mi42LjEgcmV2aWV3IGZpeCAoY2xhdWRlIE0xICsgY29kZXgg8J+foSk6IHRoZSB2Mi42LjAgcHJlZGljYXRlIFwiZGVjb2RlZFxuLy8gY29udGFpbnMgQFwiIHByb2R1Y2VkIGZhbHNlIHBvc2l0aXZlcyBmb3IgYW55IHJhbmRvbSBiYXNlNjQtc2hhcGVkIHN0cmluZ1xuLy8gdGhhdCBoYXBwZW5lZCB0byBkZWNvZGUgdG8gYnl0ZXMgY29udGFpbmluZyAweDQwLiBFbXBpcmljYWxseSB+NS03JSBoaXRcbi8vIHJhdGUgYXQgbGVuZ3RoIDIwLzI0LzI4LiBUaWdodGVuIGJ5IGFsc28gcmVxdWlyaW5nIHRoZSBkZWNvZGVkIHZhbHVlIHRvXG4vLyBtYXRjaCB0aGUgY29jb3Mgc3ViLWFzc2V0IFVVSUQgc2hhcGU6IGxvd2VyY2FzZS1oZXggKyBkYXNoZXMgKGNvY29zXG4vLyBjYW5vbmljYWwgVVVJRCB2NCkgZm9sbG93ZWQgYnkgYEA8c3ViLWtleT5gLiBUaGlzIGtlZXBzIHRoZSBuby1vcFxuLy8gaW52YXJpYW50IGZvciBwbGFpbiBVVUlEcyBBTkQgZm9yIGJhc2U2NCBzdHJpbmdzIHRoYXQgZG9uJ3QgZGVjb2RlIHRvXG4vLyBhIHJlYWwgc3ViLWFzc2V0IHJlZmVyZW5jZS5cbmNvbnN0IENPQ09TX1NVQl9BU1NFVF9SRSA9IC9eWzAtOWEtZl17OH0tWzAtOWEtZl17NH0tWzAtOWEtZl17NH0tWzAtOWEtZl17NH0tWzAtOWEtZl17MTJ9QFtcXHcuLV0rJC9pO1xuXG5mdW5jdGlvbiBpc0xpa2VseUJhc2U2NChzOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICBpZiAoIXMgfHwgcy5sZW5ndGggJSA0ICE9PSAwKSByZXR1cm4gZmFsc2U7XG4gICAgcmV0dXJuIEJBU0U2NF9SRS50ZXN0KHMpO1xufVxuXG4vKipcbiAqIERlY29kZSBhIFVVSUQgdGhhdCBtYXkgaGF2ZSBiZWVuIGJhc2U2NC1lbmNvZGVkIGJ5IGEgY2xpZW50IHRvIGRvZGdlXG4gKiBgQGAgbWFuZ2xpbmcgb24gdGhlIHdpcmUuIFJldHVybnMgdGhlIGlucHV0IHVuY2hhbmdlZCBmb3IgcGxhaW4gVVVJRHNcbiAqIEFORCBmb3IgYW55IGJhc2U2NC1zaGFwZWQgaW5wdXQgdGhhdCBkb2Vzbid0IGRlY29kZSB0byBhIHJlY29nbmlzYWJsZVxuICogY29jb3Mgc3ViLWFzc2V0IFVVSUQgKGA8Y2Fub25pY2FsLXV1aWQ+QDxzdWIta2V5PmApLlxuICpcbiAqIFNhZmUgbm8tb3AgY2FzZXMgdmVyaWZpZWQ6XG4gKiAgIC0gcGxhaW4gVVVJRCAoaGFzIGRhc2hlcywgcmVnZXggcmVqZWN0cykg4oaSIHVuY2hhbmdlZFxuICogICAtIHJhdyBgPHV1aWQ+QDxzdWI+YCAoaGFzIGBAYCwgcmVnZXggcmVqZWN0cykg4oaSIHVuY2hhbmdlZFxuICogICAtIGFyYml0cmFyeSBiYXNlNjQgbGlrZSBgYUdWc2JHOD1gIOKGkiBkZWNvZGVkIHRvIFwiaGVsbG9cIiwgbm8gYEBgIOKGkiB1bmNoYW5nZWRcbiAqICAgLSBlbWFpbC1zaGFwZWQgYmFzZTY0IGxpa2UgYmFzZTY0KFwidXNlckBleGFtcGxlLmNvbVwiKSDihpIgY29udGFpbnMgYEBgXG4gKiAgICAgYnV0IGRvZXNuJ3QgbWF0Y2ggQ09DT1NfU1VCX0FTU0VUX1JFIOKGkiB1bmNoYW5nZWQgKHYyLjYuMSB0aWdodGVuKVxuICogICAtIHJhbmRvbSAyMC8yNC8yOC1jaGFyIGJhc2U2NCBoYXBwZW5pbmcgdG8gY29udGFpbiAweDQwIGluIGRlY29kZSDihpJcbiAqICAgICBmYWlscyBDT0NPU19TVUJfQVNTRVRfUkUg4oaSIHVuY2hhbmdlZCAodjIuNi4xIHRpZ2h0ZW4pXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBkZWNvZGVVdWlkKGlucHV0OiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIGlmICh0eXBlb2YgaW5wdXQgIT09ICdzdHJpbmcnIHx8IGlucHV0Lmxlbmd0aCA9PT0gMCkgcmV0dXJuIGlucHV0O1xuICAgIGlmICghaXNMaWtlbHlCYXNlNjQoaW5wdXQpKSByZXR1cm4gaW5wdXQ7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgZGVjb2RlZCA9IEJ1ZmZlci5mcm9tKGlucHV0LCAnYmFzZTY0JykudG9TdHJpbmcoJ3V0ZjgnKTtcbiAgICAgICAgaWYgKENPQ09TX1NVQl9BU1NFVF9SRS50ZXN0KGRlY29kZWQpKSByZXR1cm4gZGVjb2RlZDtcbiAgICB9IGNhdGNoIHtcbiAgICAgICAgLy8gaWxsLWZvcm1lZCBiYXNlNjQ7IGZhbGwgdGhyb3VnaC5cbiAgICB9XG4gICAgcmV0dXJuIGlucHV0O1xufVxuXG4vKipcbiAqIEludmVyc2Ugb2YgZGVjb2RlVXVpZC4gRW5jb2RlIGEgVVVJRCBmb3IgdHJhbnNpdCBpZiBpdCBjb250YWlucyBgQGAsXG4gKiBsZWF2ZSBwbGFpbiBVVUlEcyB1bmNoYW5nZWQuIFByb3ZpZGVkIGZvciBzeW1tZXRyeSB3aXRoIFJvbWFSb2dvdidzXG4gKiBoZWxwZXI7IGN1cnJlbnQgY29jb3MtbWNwLXNlcnZlciB0b29scyBkb24ndCBhdXRvLWVuY29kZSBvdXRib3VuZFxuICogVVVJRHMgYmVjYXVzZSB3ZSBjb250cm9sIHRoZSByZXNwb25zZSBzaGFwZSwgYnV0IGEgZnV0dXJlIGNsaWVudCBTREtcbiAqIG1pZ2h0IHdhbnQgdGhpcyB3aGVuIGVjaG9pbmcgVVVJRHMgYmFjay5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGVuY29kZVV1aWQoaW5wdXQ6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgaWYgKHR5cGVvZiBpbnB1dCAhPT0gJ3N0cmluZycgfHwgIWlucHV0LmluY2x1ZGVzKCdAJykpIHJldHVybiBpbnB1dDtcbiAgICByZXR1cm4gQnVmZmVyLmZyb20oaW5wdXQsICd1dGY4JykudG9TdHJpbmcoJ2Jhc2U2NCcpO1xufVxuIl19