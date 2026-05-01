import { PrefabTools } from '../tools/prefab-tools';

// 預製體工具測試
export class PrefabToolsTest {
    private prefabTools: PrefabTools;

    constructor() {
        this.prefabTools = new PrefabTools();
    }

    async runAllTests() {
        console.log('開始預製體工具測試...');
        
        try {
            // 測試1: 獲取工具列表
            await this.testGetTools();
            
            // 測試2: 獲取預製體列表
            await this.testGetPrefabList();
            
            // 測試3: 測試預製體創建（模擬）
            await this.testCreatePrefab();
            
            // 測試3.5: 測試預製體實例化（模擬）
            await this.testInstantiatePrefab();
            
            // 測試4: 測試預製體驗證
            await this.testValidatePrefab();
            
            console.log('所有測試完成！');
        } catch (error) {
            console.error('測試過程中發生錯誤:', error);
        }
    }

    private async testGetTools() {
        console.log('測試1: 獲取工具列表');
        const tools = this.prefabTools.getTools();
        console.log(`找到 ${tools.length} 個工具:`);
        tools.forEach(tool => {
            console.log(`  - ${tool.name}: ${tool.description}`);
        });
        console.log('測試1完成\n');
    }

    private async testGetPrefabList() {
        console.log('測試2: 獲取預製體列表');
        try {
            const result = await this.prefabTools.execute('get_prefab_list', { folder: 'db://assets' });
            if (result.success) {
                console.log(`找到 ${result.data?.length || 0} 個預製體`);
                if (result.data && result.data.length > 0) {
                    result.data.slice(0, 3).forEach((prefab: any) => {
                        console.log(`  - ${prefab.name}: ${prefab.path}`);
                    });
                }
            } else {
                console.log('獲取預製體列表失敗:', result.error);
            }
        } catch (error) {
            console.log('獲取預製體列表時發生錯誤:', error);
        }
        console.log('測試2完成\n');
    }

    private async testCreatePrefab() {
        console.log('測試3: 測試預製體創建（模擬）');
        try {
            // 模擬創建預製體
            const mockArgs = {
                nodeUuid: 'mock-node-uuid',
                savePath: 'db://assets/test',
                prefabName: 'TestPrefab'
            };
            
            const result = await this.prefabTools.execute('create_prefab', mockArgs);
            console.log('創建預製體結果:', result);
        } catch (error) {
            console.log('創建預製體時發生錯誤:', error);
        }
        console.log('測試3完成\n');
    }

    private async testInstantiatePrefab() {
        console.log('測試3.5: 測試預製體實例化（模擬）');
        try {
            // 模擬實例化預製體
            const mockArgs = {
                prefabPath: 'db://assets/prefabs/TestPrefab.prefab',
                parentUuid: 'canvas-uuid',
                position: { x: 100, y: 200, z: 0 }
            };
            
            const result = await this.prefabTools.execute('instantiate_prefab', mockArgs);
            console.log('實例化預製體結果:', result);
            
            // 測試API參數構建
            this.testCreateNodeAPIParams();
        } catch (error) {
            console.log('實例化預製體時發生錯誤:', error);
        }
        console.log('測試3.5完成\n');
    }

    private testCreateNodeAPIParams() {
        console.log('測試 create-node API 參數構建...');
        
        // 模擬 assetUuid
        const assetUuid = 'mock-prefab-uuid';
        
        // 測試基本參數
        const basicOptions = {
            assetUuid: assetUuid,
            name: 'TestPrefabInstance'
        };
        console.log('基本參數:', basicOptions);
        
        // 測試帶父節點的參數
        const withParentOptions = {
            ...basicOptions,
            parent: 'parent-node-uuid'
        };
        console.log('帶父節點參數:', withParentOptions);
        
        // 測試帶位置的參數
        const withPositionOptions = {
            ...basicOptions,
            dump: {
                position: { x: 100, y: 200, z: 0 }
            }
        };
        console.log('帶位置參數:', withPositionOptions);
        
        // 測試完整參數
        const fullOptions = {
            assetUuid: assetUuid,
            name: 'TestPrefabInstance',
            parent: 'parent-node-uuid',
            dump: {
                position: { x: 100, y: 200, z: 0 }
            },
            keepWorldTransform: false,
            unlinkPrefab: false
        };
        console.log('完整參數:', fullOptions);
    }

    private async testValidatePrefab() {
        console.log('測試4: 測試預製體驗證');
        try {
            // 測試驗證一個不存在的預製體
            const result = await this.prefabTools.execute('validate_prefab', { 
                prefabPath: 'db://assets/nonexistent.prefab' 
            });
            console.log('驗證預製體結果:', result);
        } catch (error) {
            console.log('驗證預製體時發生錯誤:', error);
        }
        console.log('測試4完成\n');
    }

}

// 如果直接運行此文件
if (typeof module !== 'undefined' && module.exports) {
    const test = new PrefabToolsTest();
    test.runAllTests();
}