import * as fs from 'fs';

export interface ResolvedCcclassAsset {
    classNames: string[];
    assetPath: string;
    assetUuid: string;
    assetUrl: string;
}

/**
 * Extract class names from Cocos @ccclass decorators.
 * Matches @ccclass('Name'), @ccclass("Name"), and @ccclass(`Name`).
 */
export function extractCcclassNames(content: string): string[] {
    const classNames: string[] = [];
    const ccclassRegex = /@ccclass\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;

    let match;
    while ((match = ccclassRegex.exec(content)) !== null) {
        const className = match[1].trim();
        if (className && !classNames.includes(className)) {
            classNames.push(className);
        }
    }

    return classNames;
}

export async function resolveCcclassFromAsset(urlOrUuid: string): Promise<ResolvedCcclassAsset> {
    const script = urlOrUuid.trim();
    if (!script) {
        throw new Error('script must be a non-empty asset URL or UUID');
    }

    const isUrl = script.startsWith('db://');
    const assetUrl = isUrl
        ? script
        : await Editor.Message.request('asset-db', 'query-url', script) as string | null;
    if (!assetUrl) {
        throw new Error(`Script asset URL not found for ${script}`);
    }

    const assetUuid = isUrl
        ? await Editor.Message.request('asset-db', 'query-uuid', assetUrl) as string | null
        : script;
    if (!assetUuid) {
        throw new Error(`Script asset UUID not found for ${assetUrl}`);
    }

    const assetPath = await Editor.Message.request('asset-db', 'query-path', assetUrl) as string | null;
    if (!assetPath) {
        throw new Error(`Script asset path not found for ${assetUrl}`);
    }
    if (!assetPath.toLowerCase().endsWith('.ts')) {
        throw new Error(`Script asset must resolve to a .ts file: ${assetPath}`);
    }

    const content = await fs.promises.readFile(assetPath, 'utf8');
    return {
        classNames: extractCcclassNames(content),
        assetPath,
        assetUuid,
        assetUrl,
    };
}
