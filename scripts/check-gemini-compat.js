// Gemini-compat schema regression guard.
//
// Walks every tool's inputSchema in the live registry and fails if any schema
// contains $ref / $defs / definitions. Gemini's tool-call parser rejects $ref
// JSON Schema shapes — Claude / OpenAI accept them, so the bug is silent until
// a Gemini client tries tools/list.
//
// Why this script exists: zod 4's z.toJSONSchema({ target: 'draft-7' }) already
// inlines reused subschemas (verified at v2.6.0). cocos-cli (which uses the
// older `zod-to-json-schema` package) needs a manual middleware patch
// (mcp.middleware.ts:218) to force inline; we don't, because zod 4 + draft-7
// is already inline-only. This guard ensures we don't regress: if a future
// dependency bump or schema rewrite reintroduces $ref, this script breaks.
//
// Usage (after `npm run build` so dist/ is fresh):
//   node scripts/check-gemini-compat.js
//
// Exit codes:
//   0 — all schemas inline, no $ref-family keys
//   1 — at least one schema has $ref/$defs/definitions; offending paths printed
//
// Run from repo root.

const path = require('path');

const { createToolRegistry } = require(path.join(__dirname, '..', 'dist', 'tools', 'registry.js'));

const FORBIDDEN_KEYS = new Set(['$ref', '$defs', 'definitions']);

function findForbidden(node, pathParts, hits) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
        for (let i = 0; i < node.length; i++) {
            findForbidden(node[i], [...pathParts, String(i)], hits);
        }
        return;
    }
    for (const key of Object.keys(node)) {
        if (FORBIDDEN_KEYS.has(key)) {
            hits.push({ pathPart: [...pathParts, key].join('.'), key });
        }
        findForbidden(node[key], [...pathParts, key], hits);
    }
}

(async () => {
    const registry = createToolRegistry();
    let totalTools = 0;
    let badTools = 0;
    const failures = [];

    for (const [category, executor] of Object.entries(registry)) {
        for (const tool of executor.getTools()) {
            totalTools++;
            const hits = [];
            findForbidden(tool.inputSchema, [], hits);
            if (hits.length > 0) {
                badTools++;
                failures.push({
                    fqName: `${category}_${tool.name}`,
                    hits,
                });
            }
        }
    }

    if (failures.length === 0) {
        console.log(`[gemini-compat] ✅ all ${totalTools} tool schemas are inline (no $ref/$defs/definitions)`);
        process.exit(0);
    }

    console.error(`[gemini-compat] ❌ ${badTools} of ${totalTools} tools have forbidden schema keys:`);
    for (const f of failures) {
        console.error(`  ${f.fqName}:`);
        for (const h of f.hits) {
            console.error(`    - ${h.pathPart} (key: ${h.key})`);
        }
    }
    console.error('\nFix: keep using zod 4 z.toJSONSchema({ target: \'draft-7\' }) in source/lib/schema.ts.');
    console.error('     If a tool ships a hand-written inputSchema, inline reused subschemas manually.');
    process.exit(1);
})();
