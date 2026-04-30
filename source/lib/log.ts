let _enableDebug = false;

export function setDebugLogEnabled(enable: boolean): void {
    _enableDebug = enable;
}

export const logger = {
    debug: (...args: any[]): void => {
        if (_enableDebug) {
            console.log(...args);
        }
    },
    info: (...args: any[]): void => {
        console.log(...args);
    },
    warn: (...args: any[]): void => {
        console.warn(...args);
    },
    error: (...args: any[]): void => {
        console.error(...args);
    },
};

// Backwards-compatible alias from P0 — prefer logger.debug for new code.
export function debugLog(...args: any[]): void {
    logger.debug(...args);
}
