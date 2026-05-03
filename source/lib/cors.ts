import { IncomingMessage, ServerResponse } from 'http';

const LOOPBACK_HOST_RE = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/;

// DNS rebinding defence: even though the server binds to 127.0.0.1, a
// malicious public DNS name resolving to 127.0.0.1 lets a browser tab
// reach this server while sending Host: attacker.com. Reject anything
// that isn't a literal loopback Host.
export function isLoopbackHost(hostHeader: string | string[] | undefined): boolean {
    if (typeof hostHeader !== 'string') return false;
    return LOOPBACK_HOST_RE.test(hostHeader.toLowerCase());
}

export function applyGameCorsHeaders(req: IncomingMessage, res: ServerResponse, gameAcao: string | null): void {
    res.setHeader('Vary', 'Origin');
    if (gameAcao !== null) {
        res.setHeader('Access-Control-Allow-Origin', gameAcao);
    }
    if (req.method === 'OPTIONS' && gameAcao !== null) {
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }
}

export function applyDefaultCorsHeaders(res: ServerResponse): void {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, mcp-session-id, mcp-protocol-version');
    res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id');
}
