"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResourceRegistry = void 0;
exports.createResourceRegistry = createResourceRegistry;
const url = __importStar(require("url"));
const MIME_JSON = 'application/json';
const STATIC_RESOURCES = [
    {
        uri: 'cocos://scene/current',
        name: 'Current scene summary',
        description: 'Active scene root metadata: name, uuid, type, active, nodeCount. Backed by scene_get_current_scene.',
        mimeType: MIME_JSON,
    },
    {
        uri: 'cocos://scene/hierarchy',
        name: 'Scene hierarchy',
        description: 'Full node hierarchy of the active scene. Component summaries omitted by default; use the tool form for the includeComponents flag. Backed by scene_get_scene_hierarchy.',
        mimeType: MIME_JSON,
    },
    {
        uri: 'cocos://scene/list',
        name: 'Project scene list',
        description: 'All .scene assets under db://assets. Backed by scene_get_scene_list.',
        mimeType: MIME_JSON,
    },
    {
        uri: 'cocos://prefabs',
        name: 'Project prefabs',
        description: 'All .prefab assets under db://assets. Use the cocos://prefabs{?folder} template to scope to a sub-folder. Backed by prefab_get_prefab_list.',
        mimeType: MIME_JSON,
    },
    {
        uri: 'cocos://project/info',
        name: 'Project info',
        description: 'Project name, path, uuid, version and Cocos version. Backed by project_get_project_info.',
        mimeType: MIME_JSON,
    },
    {
        uri: 'cocos://assets',
        name: 'Project assets',
        description: 'Asset list under db://assets, all types. Use the cocos://assets{?type,folder} template to filter by type or sub-folder. Backed by project_get_assets.',
        mimeType: MIME_JSON,
    },
];
const TEMPLATE_RESOURCES = [
    {
        uriTemplate: 'cocos://prefabs{?folder}',
        name: 'Prefabs in folder',
        description: 'Prefab list scoped to a db:// folder. Example: cocos://prefabs?folder=db://assets/ui',
        mimeType: MIME_JSON,
    },
    {
        uriTemplate: 'cocos://assets{?type,folder}',
        name: 'Assets by type and folder',
        description: 'Asset list filtered by type (all|scene|prefab|script|texture|material|mesh|audio|animation) and folder. Example: cocos://assets?type=prefab&folder=db://assets/ui',
        mimeType: MIME_JSON,
    },
];
const HANDLERS = {
    'cocos://scene/current': (r) => callTool(r, 'scene', 'get_current_scene', {}),
    'cocos://scene/hierarchy': (r) => callTool(r, 'scene', 'get_scene_hierarchy', {}),
    'cocos://scene/list': (r) => callTool(r, 'scene', 'get_scene_list', {}),
    'cocos://prefabs': (r, q) => callTool(r, 'prefab', 'get_prefab_list', q.folder ? { folder: q.folder } : {}),
    'cocos://project/info': (r) => callTool(r, 'project', 'get_project_info', {}),
    'cocos://assets': (r, q) => callTool(r, 'project', 'get_assets', Object.assign(Object.assign({}, (q.type ? { type: q.type } : {})), (q.folder ? { folder: q.folder } : {}))),
};
async function callTool(registry, category, tool, args) {
    var _a, _b;
    const executor = registry[category];
    if (!executor) {
        throw new Error(`Resource backend missing: registry has no '${category}' category`);
    }
    const response = await executor.execute(tool, args);
    if (response && response.success === false) {
        const msg = (_b = (_a = response.error) !== null && _a !== void 0 ? _a : response.message) !== null && _b !== void 0 ? _b : `${category}_${tool} failed`;
        throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }
    // Return the raw ToolResponse so callers can see data + message; clients
    // mostly care about .data, but keeping the envelope keeps parity with
    // tools/call structuredContent.
    return response;
}
class ResourceRegistry {
    constructor(registry) {
        this.registry = registry;
    }
    list() {
        return STATIC_RESOURCES.slice();
    }
    listTemplates() {
        return TEMPLATE_RESOURCES.slice();
    }
    async read(uri) {
        const { base, query } = parseUri(uri);
        const handler = HANDLERS[base];
        if (!handler) {
            throw new Error(`Unknown resource URI: ${uri}`);
        }
        const data = await handler(this.registry, query);
        return {
            uri,
            mimeType: MIME_JSON,
            text: JSON.stringify(data),
        };
    }
}
exports.ResourceRegistry = ResourceRegistry;
// Strip query string + fragment, return base URI for handler lookup plus
// the parsed query params for parameterized handlers.
function parseUri(uri) {
    const parsed = url.parse(uri, true);
    // url.parse splits scheme://host/path?q. For cocos://scene/current:
    //   parsed.protocol = 'cocos:'
    //   parsed.host     = 'scene'
    //   parsed.pathname = '/current'
    //   parsed.query    = {}
    // Reconstruct base without query/fragment.
    if (!parsed.protocol || !parsed.host) {
        return { base: uri, query: {} };
    }
    const base = `${parsed.protocol}//${parsed.host}${parsed.pathname || ''}`;
    const query = {};
    for (const [k, v] of Object.entries(parsed.query)) {
        if (typeof v === 'string')
            query[k] = v;
        else if (Array.isArray(v) && v.length > 0)
            query[k] = v[0];
    }
    return { base, query };
}
function createResourceRegistry(toolRegistry) {
    return new ResourceRegistry(toolRegistry);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVnaXN0cnkuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zb3VyY2UvcmVzb3VyY2VzL3JlZ2lzdHJ5LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQTZLQSx3REFFQztBQS9LRCx5Q0FBMkI7QUF1QzNCLE1BQU0sU0FBUyxHQUFHLGtCQUFrQixDQUFDO0FBRXJDLE1BQU0sZ0JBQWdCLEdBQXlCO0lBQzNDO1FBQ0ksR0FBRyxFQUFFLHVCQUF1QjtRQUM1QixJQUFJLEVBQUUsdUJBQXVCO1FBQzdCLFdBQVcsRUFBRSxxR0FBcUc7UUFDbEgsUUFBUSxFQUFFLFNBQVM7S0FDdEI7SUFDRDtRQUNJLEdBQUcsRUFBRSx5QkFBeUI7UUFDOUIsSUFBSSxFQUFFLGlCQUFpQjtRQUN2QixXQUFXLEVBQUUseUtBQXlLO1FBQ3RMLFFBQVEsRUFBRSxTQUFTO0tBQ3RCO0lBQ0Q7UUFDSSxHQUFHLEVBQUUsb0JBQW9CO1FBQ3pCLElBQUksRUFBRSxvQkFBb0I7UUFDMUIsV0FBVyxFQUFFLHNFQUFzRTtRQUNuRixRQUFRLEVBQUUsU0FBUztLQUN0QjtJQUNEO1FBQ0ksR0FBRyxFQUFFLGlCQUFpQjtRQUN0QixJQUFJLEVBQUUsaUJBQWlCO1FBQ3ZCLFdBQVcsRUFBRSw2SUFBNkk7UUFDMUosUUFBUSxFQUFFLFNBQVM7S0FDdEI7SUFDRDtRQUNJLEdBQUcsRUFBRSxzQkFBc0I7UUFDM0IsSUFBSSxFQUFFLGNBQWM7UUFDcEIsV0FBVyxFQUFFLDBGQUEwRjtRQUN2RyxRQUFRLEVBQUUsU0FBUztLQUN0QjtJQUNEO1FBQ0ksR0FBRyxFQUFFLGdCQUFnQjtRQUNyQixJQUFJLEVBQUUsZ0JBQWdCO1FBQ3RCLFdBQVcsRUFBRSx1SkFBdUo7UUFDcEssUUFBUSxFQUFFLFNBQVM7S0FDdEI7Q0FDSixDQUFDO0FBRUYsTUFBTSxrQkFBa0IsR0FBaUM7SUFDckQ7UUFDSSxXQUFXLEVBQUUsMEJBQTBC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UUFBUSxLQUFLLE1BQU0sQ0FBQyxJQUFJLEdBQUcsTUFBTSxDQUFDLFFBQVEsSUFBSSxFQUFFLEVBQUUsQ0FBQztJQUMxRSxNQUFNLEtBQUssR0FBMkIsRUFBRSxDQUFDO0lBQ3pDLEtBQUssTUFBTSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsSUFBSSxNQUFNLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO1FBQ2hELElBQUksT0FBTyxDQUFDLEtBQUssUUFBUTtZQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUM7YUFDbkMsSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNLEdBQUcsQ0FBQztZQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDL0QsQ0FBQztJQUNELE9BQU8sRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLENBQUM7QUFDM0IsQ0FBQztBQUVELFNBQWdCLHNCQUFzQixDQUFDLFlBQTBCO0lBQzdELE9BQU8sSUFBSSxnQkFBZ0IsQ0FBQyxZQUFZLENBQUMsQ0FBQztBQUM5QyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgdXJsIGZyb20gJ3VybCc7XG5pbXBvcnQgeyBUb29sUmVnaXN0cnkgfSBmcm9tICcuLi90b29scy9yZWdpc3RyeSc7XG5pbXBvcnQgeyBUb29sUmVzcG9uc2UgfSBmcm9tICcuLi90eXBlcyc7XG5cbi8qKlxuICogTUNQIFJlc291cmNlcyBmb3IgY29jb3MtbWNwLXNlcnZlci5cbiAqXG4gKiBULVAzLTEgc3VyZmFjZSDigJQgc2VlIGRvY3MvcmVzZWFyY2gvdC1wMy0xLXByaW9yLWFydC5tZCBhbmRcbiAqIGRvY3MvSEFORE9GRi5tZCDCp0ItMiBmb3IgZGVzaWduIHJhdGlvbmFsZS5cbiAqXG4gKiBFYWNoIHJlc291cmNlIGlzIGJhY2tlZCBieSBhbiBleGlzdGluZyByZWFkLW9ubHkgVG9vbEV4ZWN1dG9yIGNhbGwuXG4gKiBSZXNvdXJjZSByZWFkIHBhdGhzIHJldXNlIHRoZSB0b29sIHJ1bnRpbWUgc28gYmVoYXZpb3VyIHN0YXlzXG4gKiBieXRlLWlkZW50aWNhbCBiZXR3ZWVuIHJlc291cmNlIHJlYWQgYW5kIHRvb2wgY2FsbCAoc21va2UtbWNwLXNkay5qc1xuICogZW5mb3JjZXMgdGhpcyB3aXRoIGFuIGVxdWl2YWxlbmNlIGNoZWNrKS5cbiAqXG4gKiBVUkkgcHJlZml4IGlzIGBjb2NvczovL2AgdG8gYWxpZ24gd2l0aCBjb2Nvcy1jbGkgKG9mZmljaWFsKSBhbmRcbiAqIEZ1bnBsYXlBSSAoY2xvc2VzdCBzaWJsaW5nIGVtYmVkZGVkIGV4dGVuc2lvbikuXG4gKi9cblxuZXhwb3J0IGludGVyZmFjZSBSZXNvdXJjZURlc2NyaXB0b3Ige1xuICAgIHVyaTogc3RyaW5nO1xuICAgIG5hbWU6IHN0cmluZztcbiAgICBkZXNjcmlwdGlvbjogc3RyaW5nO1xuICAgIG1pbWVUeXBlOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUmVzb3VyY2VUZW1wbGF0ZURlc2NyaXB0b3Ige1xuICAgIHVyaVRlbXBsYXRlOiBzdHJpbmc7XG4gICAgbmFtZTogc3RyaW5nO1xuICAgIGRlc2NyaXB0aW9uOiBzdHJpbmc7XG4gICAgbWltZVR5cGU6IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBSZXNvdXJjZUNvbnRlbnQge1xuICAgIHVyaTogc3RyaW5nO1xuICAgIG1pbWVUeXBlOiBzdHJpbmc7XG4gICAgdGV4dDogc3RyaW5nO1xufVxuXG5jb25zdCBNSU1FX0pTT04gPSAnYXBwbGljYXRpb24vanNvbic7XG5cbmNvbnN0IFNUQVRJQ19SRVNPVVJDRVM6IFJlc291cmNlRGVzY3JpcHRvcltdID0gW1xuICAgIHtcbiAgICAgICAgdXJpOiAnY29jb3M6Ly9zY2VuZS9jdXJyZW50JyxcbiAgICAgICAgbmFtZTogJ0N1cnJlbnQgc2NlbmUgc3VtbWFyeScsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnQWN0aXZlIHNjZW5lIHJvb3QgbWV0YWRhdGE6IG5hbWUsIHV1aWQsIHR5cGUsIGFjdGl2ZSwgbm9kZUNvdW50LiBCYWNrZWQgYnkgc2NlbmVfZ2V0X2N1cnJlbnRfc2NlbmUuJyxcbiAgICAgICAgbWltZVR5cGU6IE1JTUVfSlNPTixcbiAgICB9LFxuICAgIHtcbiAgICAgICAgdXJpOiAnY29jb3M6Ly9zY2VuZS9oaWVyYXJjaHknLFxuICAgICAgICBuYW1lOiAnU2NlbmUgaGllcmFyY2h5JyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdGdWxsIG5vZGUgaGllcmFyY2h5IG9mIHRoZSBhY3RpdmUgc2NlbmUuIENvbXBvbmVudCBzdW1tYXJpZXMgb21pdHRlZCBieSBkZWZhdWx0OyB1c2UgdGhlIHRvb2wgZm9ybSBmb3IgdGhlIGluY2x1ZGVDb21wb25lbnRzIGZsYWcuIEJhY2tlZCBieSBzY2VuZV9nZXRfc2NlbmVfaGllcmFyY2h5LicsXG4gICAgICAgIG1pbWVUeXBlOiBNSU1FX0pTT04sXG4gICAgfSxcbiAgICB7XG4gICAgICAgIHVyaTogJ2NvY29zOi8vc2NlbmUvbGlzdCcsXG4gICAgICAgIG5hbWU6ICdQcm9qZWN0IHNjZW5lIGxpc3QnLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ0FsbCAuc2NlbmUgYXNzZXRzIHVuZGVyIGRiOi8vYXNzZXRzLiBCYWNrZWQgYnkgc2NlbmVfZ2V0X3NjZW5lX2xpc3QuJyxcbiAgICAgICAgbWltZVR5cGU6IE1JTUVfSlNPTixcbiAgICB9LFxuICAgIHtcbiAgICAgICAgdXJpOiAnY29jb3M6Ly9wcmVmYWJzJyxcbiAgICAgICAgbmFtZTogJ1Byb2plY3QgcHJlZmFicycsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnQWxsIC5wcmVmYWIgYXNzZXRzIHVuZGVyIGRiOi8vYXNzZXRzLiBVc2UgdGhlIGNvY29zOi8vcHJlZmFic3s/Zm9sZGVyfSB0ZW1wbGF0ZSB0byBzY29wZSB0byBhIHN1Yi1mb2xkZXIuIEJhY2tlZCBieSBwcmVmYWJfZ2V0X3ByZWZhYl9saXN0LicsXG4gICAgICAgIG1pbWVUeXBlOiBNSU1FX0pTT04sXG4gICAgfSxcbiAgICB7XG4gICAgICAgIHVyaTogJ2NvY29zOi8vcHJvamVjdC9pbmZvJyxcbiAgICAgICAgbmFtZTogJ1Byb2plY3QgaW5mbycsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnUHJvamVjdCBuYW1lLCBwYXRoLCB1dWlkLCB2ZXJzaW9uIGFuZCBDb2NvcyB2ZXJzaW9uLiBCYWNrZWQgYnkgcHJvamVjdF9nZXRfcHJvamVjdF9pbmZvLicsXG4gICAgICAgIG1pbWVUeXBlOiBNSU1FX0pTT04sXG4gICAgfSxcbiAgICB7XG4gICAgICAgIHVyaTogJ2NvY29zOi8vYXNzZXRzJyxcbiAgICAgICAgbmFtZTogJ1Byb2plY3QgYXNzZXRzJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdBc3NldCBsaXN0IHVuZGVyIGRiOi8vYXNzZXRzLCBhbGwgdHlwZXMuIFVzZSB0aGUgY29jb3M6Ly9hc3NldHN7P3R5cGUsZm9sZGVyfSB0ZW1wbGF0ZSB0byBmaWx0ZXIgYnkgdHlwZSBvciBzdWItZm9sZGVyLiBCYWNrZWQgYnkgcHJvamVjdF9nZXRfYXNzZXRzLicsXG4gICAgICAgIG1pbWVUeXBlOiBNSU1FX0pTT04sXG4gICAgfSxcbl07XG5cbmNvbnN0IFRFTVBMQVRFX1JFU09VUkNFUzogUmVzb3VyY2VUZW1wbGF0ZURlc2NyaXB0b3JbXSA9IFtcbiAgICB7XG4gICAgICAgIHVyaVRlbXBsYXRlOiAnY29jb3M6Ly9wcmVmYWJzez9mb2xkZXJ9JyxcbiAgICAgICAgbmFtZTogJ1ByZWZhYnMgaW4gZm9sZGVyJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdQcmVmYWIgbGlzdCBzY29wZWQgdG8gYSBkYjovLyBmb2xkZXIuIEV4YW1wbGU6IGNvY29zOi8vcHJlZmFicz9mb2xkZXI9ZGI6Ly9hc3NldHMvdWknLFxuICAgICAgICBtaW1lVHlwZTogTUlNRV9KU09OLFxuICAgIH0sXG4gICAge1xuICAgICAgICB1cmlUZW1wbGF0ZTogJ2NvY29zOi8vYXNzZXRzez90eXBlLGZvbGRlcn0nLFxuICAgICAgICBuYW1lOiAnQXNzZXRzIGJ5IHR5cGUgYW5kIGZvbGRlcicsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnQXNzZXQgbGlzdCBmaWx0ZXJlZCBieSB0eXBlIChhbGx8c2NlbmV8cHJlZmFifHNjcmlwdHx0ZXh0dXJlfG1hdGVyaWFsfG1lc2h8YXVkaW98YW5pbWF0aW9uKSBhbmQgZm9sZGVyLiBFeGFtcGxlOiBjb2NvczovL2Fzc2V0cz90eXBlPXByZWZhYiZmb2xkZXI9ZGI6Ly9hc3NldHMvdWknLFxuICAgICAgICBtaW1lVHlwZTogTUlNRV9KU09OLFxuICAgIH0sXG5dO1xuXG50eXBlIEhhbmRsZXIgPSAocmVnaXN0cnk6IFRvb2xSZWdpc3RyeSwgcXVlcnk6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4pID0+IFByb21pc2U8YW55PjtcblxuY29uc3QgSEFORExFUlM6IFJlY29yZDxzdHJpbmcsIEhhbmRsZXI+ID0ge1xuICAgICdjb2NvczovL3NjZW5lL2N1cnJlbnQnOiAocikgPT4gY2FsbFRvb2wociwgJ3NjZW5lJywgJ2dldF9jdXJyZW50X3NjZW5lJywge30pLFxuICAgICdjb2NvczovL3NjZW5lL2hpZXJhcmNoeSc6IChyKSA9PiBjYWxsVG9vbChyLCAnc2NlbmUnLCAnZ2V0X3NjZW5lX2hpZXJhcmNoeScsIHt9KSxcbiAgICAnY29jb3M6Ly9zY2VuZS9saXN0JzogKHIpID0+IGNhbGxUb29sKHIsICdzY2VuZScsICdnZXRfc2NlbmVfbGlzdCcsIHt9KSxcbiAgICAnY29jb3M6Ly9wcmVmYWJzJzogKHIsIHEpID0+IGNhbGxUb29sKHIsICdwcmVmYWInLCAnZ2V0X3ByZWZhYl9saXN0JywgcS5mb2xkZXIgPyB7IGZvbGRlcjogcS5mb2xkZXIgfSA6IHt9KSxcbiAgICAnY29jb3M6Ly9wcm9qZWN0L2luZm8nOiAocikgPT4gY2FsbFRvb2wociwgJ3Byb2plY3QnLCAnZ2V0X3Byb2plY3RfaW5mbycsIHt9KSxcbiAgICAnY29jb3M6Ly9hc3NldHMnOiAociwgcSkgPT4gY2FsbFRvb2wociwgJ3Byb2plY3QnLCAnZ2V0X2Fzc2V0cycsIHtcbiAgICAgICAgLi4uKHEudHlwZSA/IHsgdHlwZTogcS50eXBlIH0gOiB7fSksXG4gICAgICAgIC4uLihxLmZvbGRlciA/IHsgZm9sZGVyOiBxLmZvbGRlciB9IDoge30pLFxuICAgIH0pLFxufTtcblxuYXN5bmMgZnVuY3Rpb24gY2FsbFRvb2wocmVnaXN0cnk6IFRvb2xSZWdpc3RyeSwgY2F0ZWdvcnk6IHN0cmluZywgdG9vbDogc3RyaW5nLCBhcmdzOiBhbnkpOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnN0IGV4ZWN1dG9yID0gcmVnaXN0cnlbY2F0ZWdvcnldO1xuICAgIGlmICghZXhlY3V0b3IpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBSZXNvdXJjZSBiYWNrZW5kIG1pc3Npbmc6IHJlZ2lzdHJ5IGhhcyBubyAnJHtjYXRlZ29yeX0nIGNhdGVnb3J5YCk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3BvbnNlOiBUb29sUmVzcG9uc2UgPSBhd2FpdCBleGVjdXRvci5leGVjdXRlKHRvb2wsIGFyZ3MpO1xuICAgIGlmIChyZXNwb25zZSAmJiByZXNwb25zZS5zdWNjZXNzID09PSBmYWxzZSkge1xuICAgICAgICBjb25zdCBtc2cgPSByZXNwb25zZS5lcnJvciA/PyByZXNwb25zZS5tZXNzYWdlID8/IGAke2NhdGVnb3J5fV8ke3Rvb2x9IGZhaWxlZGA7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcih0eXBlb2YgbXNnID09PSAnc3RyaW5nJyA/IG1zZyA6IEpTT04uc3RyaW5naWZ5KG1zZykpO1xuICAgIH1cbiAgICAvLyBSZXR1cm4gdGhlIHJhdyBUb29sUmVzcG9uc2Ugc28gY2FsbGVycyBjYW4gc2VlIGRhdGEgKyBtZXNzYWdlOyBjbGllbnRzXG4gICAgLy8gbW9zdGx5IGNhcmUgYWJvdXQgLmRhdGEsIGJ1dCBrZWVwaW5nIHRoZSBlbnZlbG9wZSBrZWVwcyBwYXJpdHkgd2l0aFxuICAgIC8vIHRvb2xzL2NhbGwgc3RydWN0dXJlZENvbnRlbnQuXG4gICAgcmV0dXJuIHJlc3BvbnNlO1xufVxuXG5leHBvcnQgY2xhc3MgUmVzb3VyY2VSZWdpc3RyeSB7XG4gICAgY29uc3RydWN0b3IocHJpdmF0ZSByZWdpc3RyeTogVG9vbFJlZ2lzdHJ5KSB7fVxuXG4gICAgbGlzdCgpOiBSZXNvdXJjZURlc2NyaXB0b3JbXSB7XG4gICAgICAgIHJldHVybiBTVEFUSUNfUkVTT1VSQ0VTLnNsaWNlKCk7XG4gICAgfVxuXG4gICAgbGlzdFRlbXBsYXRlcygpOiBSZXNvdXJjZVRlbXBsYXRlRGVzY3JpcHRvcltdIHtcbiAgICAgICAgcmV0dXJuIFRFTVBMQVRFX1JFU09VUkNFUy5zbGljZSgpO1xuICAgIH1cblxuICAgIGFzeW5jIHJlYWQodXJpOiBzdHJpbmcpOiBQcm9taXNlPFJlc291cmNlQ29udGVudD4ge1xuICAgICAgICBjb25zdCB7IGJhc2UsIHF1ZXJ5IH0gPSBwYXJzZVVyaSh1cmkpO1xuICAgICAgICBjb25zdCBoYW5kbGVyID0gSEFORExFUlNbYmFzZV07XG4gICAgICAgIGlmICghaGFuZGxlcikge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmtub3duIHJlc291cmNlIFVSSTogJHt1cml9YCk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZGF0YSA9IGF3YWl0IGhhbmRsZXIodGhpcy5yZWdpc3RyeSwgcXVlcnkpO1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgdXJpLFxuICAgICAgICAgICAgbWltZVR5cGU6IE1JTUVfSlNPTixcbiAgICAgICAgICAgIHRleHQ6IEpTT04uc3RyaW5naWZ5KGRhdGEpLFxuICAgICAgICB9O1xuICAgIH1cbn1cblxuLy8gU3RyaXAgcXVlcnkgc3RyaW5nICsgZnJhZ21lbnQsIHJldHVybiBiYXNlIFVSSSBmb3IgaGFuZGxlciBsb29rdXAgcGx1c1xuLy8gdGhlIHBhcnNlZCBxdWVyeSBwYXJhbXMgZm9yIHBhcmFtZXRlcml6ZWQgaGFuZGxlcnMuXG5mdW5jdGlvbiBwYXJzZVVyaSh1cmk6IHN0cmluZyk6IHsgYmFzZTogc3RyaW5nOyBxdWVyeTogUmVjb3JkPHN0cmluZywgc3RyaW5nPiB9IHtcbiAgICBjb25zdCBwYXJzZWQgPSB1cmwucGFyc2UodXJpLCB0cnVlKTtcbiAgICAvLyB1cmwucGFyc2Ugc3BsaXRzIHNjaGVtZTovL2hvc3QvcGF0aD9xLiBGb3IgY29jb3M6Ly9zY2VuZS9jdXJyZW50OlxuICAgIC8vICAgcGFyc2VkLnByb3RvY29sID0gJ2NvY29zOidcbiAgICAvLyAgIHBhcnNlZC5ob3N0ICAgICA9ICdzY2VuZSdcbiAgICAvLyAgIHBhcnNlZC5wYXRobmFtZSA9ICcvY3VycmVudCdcbiAgICAvLyAgIHBhcnNlZC5xdWVyeSAgICA9IHt9XG4gICAgLy8gUmVjb25zdHJ1Y3QgYmFzZSB3aXRob3V0IHF1ZXJ5L2ZyYWdtZW50LlxuICAgIGlmICghcGFyc2VkLnByb3RvY29sIHx8ICFwYXJzZWQuaG9zdCkge1xuICAgICAgICByZXR1cm4geyBiYXNlOiB1cmksIHF1ZXJ5OiB7fSB9O1xuICAgIH1cbiAgICBjb25zdCBiYXNlID0gYCR7cGFyc2VkLnByb3RvY29sfS8vJHtwYXJzZWQuaG9zdH0ke3BhcnNlZC5wYXRobmFtZSB8fCAnJ31gO1xuICAgIGNvbnN0IHF1ZXJ5OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge307XG4gICAgZm9yIChjb25zdCBbaywgdl0gb2YgT2JqZWN0LmVudHJpZXMocGFyc2VkLnF1ZXJ5KSkge1xuICAgICAgICBpZiAodHlwZW9mIHYgPT09ICdzdHJpbmcnKSBxdWVyeVtrXSA9IHY7XG4gICAgICAgIGVsc2UgaWYgKEFycmF5LmlzQXJyYXkodikgJiYgdi5sZW5ndGggPiAwKSBxdWVyeVtrXSA9IHZbMF07XG4gICAgfVxuICAgIHJldHVybiB7IGJhc2UsIHF1ZXJ5IH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVSZXNvdXJjZVJlZ2lzdHJ5KHRvb2xSZWdpc3RyeTogVG9vbFJlZ2lzdHJ5KTogUmVzb3VyY2VSZWdpc3RyeSB7XG4gICAgcmV0dXJuIG5ldyBSZXNvdXJjZVJlZ2lzdHJ5KHRvb2xSZWdpc3RyeSk7XG59XG4iXX0=