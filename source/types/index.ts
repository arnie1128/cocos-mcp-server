export interface MCPServerSettings {
    port: number;
    autoStart: boolean;
    enableDebugLog: boolean;
    allowedOrigins: string[];
    maxConnections: number;
    // v2.3.0: opt-in for execute_javascript with context='editor'.
    // Editor host context can require() Node modules and touch fs — arbitrary
    // AI code there is a prompt-injection risk. Default false; user flips on
    // in panel UI when they explicitly want broad host-side scripting.
    enableEditorContextEval?: boolean;
    // v2.4.8 A3: when true, scene-bridge wraps every scene-script invocation
    // through `runWithCapture`, monkey-patching console.{log,warn,error} on
    // the scene side and attaching `capturedLogs` to the ToolResponse so AI
    // sees Cocos engine console output for the operation. Default true —
    // overhead is one extra envelope on the scene-script side, no extra IPC.
    enableSceneLogCapture?: boolean;
}

export interface ServerStatus {
    running: boolean;
    port: number;
    clients: number;
}

export interface ToolDefinition {
    name: string;
    description: string;
    inputSchema: any;
}

export interface ToolResponse {
    success: boolean;
    data?: any;
    message?: string;
    error?: string;
    instruction?: string;
    warning?: string;
    verificationData?: any;
    updatedProperties?: string[];
    // v2.4.8 A3: cocos console output captured during the underlying
    // scene-script run. Present only when enableSceneLogCapture is on.
    capturedLogs?: CapturedLogEntry[];
}

export interface CapturedLogEntry {
    level: 'log' | 'warn' | 'error';
    message: string;
    ts: number;
}

export interface NodeInfo {
    uuid: string;
    name: string;
    active: boolean;
    position?: { x: number; y: number; z: number };
    rotation?: { x: number; y: number; z: number };
    scale?: { x: number; y: number; z: number };
    parent?: string;
    children?: string[];
    components?: ComponentInfo[];
    layer?: number;
    mobility?: number;
}

export interface ComponentInfo {
    type: string;
    enabled: boolean;
    properties?: Record<string, any>;
}

export interface SceneInfo {
    name: string;
    uuid: string;
    path: string;
}

export interface PrefabInfo {
    name: string;
    uuid: string;
    path: string;
    folder: string;
    createTime?: string;
    modifyTime?: string;
    dependencies?: string[];
}

export interface AssetInfo {
    name: string;
    uuid: string;
    path: string;
    type: string;
    size?: number;
    isDirectory: boolean;
    meta?: {
        ver: string;
        importer: string;
    };
}

export interface ProjectInfo {
    name: string;
    path: string;
    uuid: string;
    version: string;
    cocosVersion: string;
}

export interface PerformanceStats {
    nodeCount: number;
    componentCount: number;
    drawCalls: number;
    triangles: number;
    memory: Record<string, any>;
}

export interface ValidationIssue {
    type: 'error' | 'warning' | 'info';
    category: string;
    message: string;
    details?: any;
    suggestion?: string;
}

export interface ValidationResult {
    valid: boolean;
    issueCount: number;
    issues: ValidationIssue[];
}

export interface MCPClient {
    id: string;
    lastActivity: Date;
    userAgent?: string;
}

export interface ToolExecutor {
    getTools(): ToolDefinition[];
    execute(toolName: string, args: any): Promise<ToolResponse>;
}

// 工具配置管理相關接口
export interface ToolConfig {
    category: string;
    name: string;
    enabled: boolean;
    description: string;
}

export interface ToolConfiguration {
    id: string;
    name: string;
    description?: string;
    tools: ToolConfig[];
    createdAt: string;
    updatedAt: string;
}

export interface ToolManagerSettings {
    configurations: ToolConfiguration[];
    currentConfigId: string;
    maxConfigSlots: number;
}

export interface ToolManagerState {
    availableTools: ToolConfig[];
    currentConfiguration: ToolConfiguration | null;
    configurations: ToolConfiguration[];
}