import { IncomingMessage, ServerResponse } from 'http';

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
