// Per-process opt-in flags. Cleared on extension reload.
//
// editorContextEvalEnabled gates execute_javascript with context='editor'.
// Default off because the editor host context can `require()` Node modules
// and access the filesystem; arbitrary AI-generated code there is a real
// prompt-injection risk. User flips this on in panel UI when they explicitly
// want broad host-side scripting.

let _editorContextEvalEnabled = false;

export function setEditorContextEvalEnabled(enabled: boolean): void {
    _editorContextEvalEnabled = enabled;
}

export function isEditorContextEvalEnabled(): boolean {
    return _editorContextEvalEnabled;
}
