let _enableDebug = false;

export function setDebugLogEnabled(enable: boolean): void {
    _enableDebug = enable;
}

export function debugLog(...args: any[]): void {
    if (_enableDebug) {
        console.log(...args);
    }
}
