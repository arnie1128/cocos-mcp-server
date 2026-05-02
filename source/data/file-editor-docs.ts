const REDUNDANT_TAG = '[claude-code-redundant] Use Edit/Write tool from your IDE if available. ';

/**
 * Tool descriptions for file-editor-tools. Externalized in v2.11.
 */
export const FILE_EDITOR_DOCS = {
    insert_text: REDUNDANT_TAG + 'Insert a new line at the given 1-based line number. If line exceeds total, text is appended at end of file. Triggers cocos asset-db refresh on cocos-recognised extensions (.ts/.json/.scene/.prefab/etc.) so the editor reimports.',
    delete_lines: REDUNDANT_TAG + 'Delete a range of lines (1-based, inclusive). Triggers cocos asset-db refresh.',
    replace_text: REDUNDANT_TAG + 'Find/replace text in a file. Plain string by default; pass useRegex:true to interpret search as a regex. Replaces first occurrence only unless replaceAll:true. Regex backreferences ($1, $&, $`, $\') work when useRegex:true. Triggers cocos asset-db refresh.',
    query_text: REDUNDANT_TAG + 'Read a range of lines (1-based, inclusive). Returns lines with line numbers; total line count of file in data.totalLines. Read-only; no asset-db refresh.',
} as const;
