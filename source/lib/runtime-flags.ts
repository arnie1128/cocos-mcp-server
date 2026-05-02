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

// v2.4.8 A3: sceneLogCaptureEnabled controls whether scene-bridge routes
// every runSceneMethod through `runWithCapture` (a scene-script wrapper
// that monkey-patches console and returns capturedLogs alongside the
// method's normal return). Default true — DX win for AI debugging with
// negligible cost. User can flip off via settings if they observe the
// wrapper interfering with a scene-script that itself needs to read
// console (extremely unlikely, but provided as escape hatch).
let _sceneLogCaptureEnabled = true;

export function setSceneLogCaptureEnabled(enabled: boolean): void {
    _sceneLogCaptureEnabled = enabled;
}

export function isSceneLogCaptureEnabled(): boolean {
    return _sceneLogCaptureEnabled;
}
