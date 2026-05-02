import { ToolExecutor } from '../types';
import { SceneTools } from './scene-tools';
import { NodeTools } from './node-tools';
import { ComponentTools } from './component-tools';
import { PrefabTools } from './prefab-tools';
import { ProjectTools } from './project-tools';
import { DebugTools } from './debug-tools';
import { PreferencesTools } from './preferences-tools';
import { ServerTools } from './server-tools';
import { BroadcastTools } from './broadcast-tools';
import { SceneAdvancedTools } from './scene-advanced-tools';
import { SceneViewTools } from './scene-view-tools';
import { ReferenceImageTools } from './reference-image-tools';
import { AssetAdvancedTools } from './asset-advanced-tools';
import { ValidationTools } from './validation-tools';
import { InspectorTools } from './inspector-tools';
import { AssetMetaTools } from './asset-meta-tools';
import { AnimationTools } from './animation-tools';

export type ToolRegistry = Record<string, ToolExecutor>;

export function createToolRegistry(): ToolRegistry {
    return {
        scene: new SceneTools(),
        node: new NodeTools(),
        component: new ComponentTools(),
        prefab: new PrefabTools(),
        project: new ProjectTools(),
        debug: new DebugTools(),
        preferences: new PreferencesTools(),
        server: new ServerTools(),
        broadcast: new BroadcastTools(),
        sceneAdvanced: new SceneAdvancedTools(),
        sceneView: new SceneViewTools(),
        referenceImage: new ReferenceImageTools(),
        assetAdvanced: new AssetAdvancedTools(),
        validation: new ValidationTools(),
        inspector: new InspectorTools(),
        assetMeta: new AssetMetaTools(),
        animation: new AnimationTools(),
    };
}
