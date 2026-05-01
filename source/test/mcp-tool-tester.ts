declare const Editor: any;

/**
 * MCP 工具測試器 - 直接測試通過 WebSocket 的 MCP 工具
 */
export class MCPToolTester {
    private ws: WebSocket | null = null;
    private messageId = 0;
    private responseHandlers = new Map<number, (response: any) => void>();

    async connect(port: number): Promise<boolean> {
        return new Promise((resolve) => {
            try {
                this.ws = new WebSocket(`ws://localhost:${port}`);
                
                this.ws.onopen = () => {
                    console.log('WebSocket 連接成功');
                    resolve(true);
                };
                
                this.ws.onerror = (error) => {
                    console.error('WebSocket 連接錯誤:', error);
                    resolve(false);
                };
                
                this.ws.onmessage = (event) => {
                    try {
                        const response = JSON.parse(event.data);
                        if (response.id && this.responseHandlers.has(response.id)) {
                            const handler = this.responseHandlers.get(response.id);
                            this.responseHandlers.delete(response.id);
                            handler?.(response);
                        }
                    } catch (error) {
                        console.error('處理響應時出錯:', error);
                    }
                };
            } catch (error) {
                console.error('創建 WebSocket 時出錯:', error);
                resolve(false);
            }
        });
    }

    async callTool(tool: string, args: any = {}): Promise<any> {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            throw new Error('WebSocket 未連接');
        }

        return new Promise((resolve, reject) => {
            const id = ++this.messageId;
            const request = {
                jsonrpc: '2.0',
                id,
                method: 'tools/call',
                params: {
                    name: tool,
                    arguments: args
                }
            };

            const timeout = setTimeout(() => {
                this.responseHandlers.delete(id);
                reject(new Error('請求超時'));
            }, 10000);

            this.responseHandlers.set(id, (response) => {
                clearTimeout(timeout);
                if (response.error) {
                    reject(new Error(response.error.message));
                } else {
                    resolve(response.result);
                }
            });

            this.ws!.send(JSON.stringify(request));
        });
    }

    async listTools(): Promise<any> {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            throw new Error('WebSocket 未連接');
        }

        return new Promise((resolve, reject) => {
            const id = ++this.messageId;
            const request = {
                jsonrpc: '2.0',
                id,
                method: 'tools/list'
            };

            const timeout = setTimeout(() => {
                this.responseHandlers.delete(id);
                reject(new Error('請求超時'));
            }, 10000);

            this.responseHandlers.set(id, (response) => {
                clearTimeout(timeout);
                if (response.error) {
                    reject(new Error(response.error.message));
                } else {
                    resolve(response.result);
                }
            });

            this.ws!.send(JSON.stringify(request));
        });
    }

    async testMCPTools() {
        console.log('\n=== 測試 MCP 工具（通過 WebSocket）===');
        
        try {
            // 0. 獲取工具列表
            console.log('\n0. 獲取工具列表...');
            const toolsList = await this.listTools();
            console.log(`找到 ${toolsList.tools?.length || 0} 個工具:`);
            if (toolsList.tools) {
                for (const tool of toolsList.tools.slice(0, 10)) { // 只顯示前10個
                    console.log(`  - ${tool.name}: ${tool.description}`);
                }
                if (toolsList.tools.length > 10) {
                    console.log(`  ... 還有 ${toolsList.tools.length - 10} 個工具`);
                }
            }
            
            // 1. 測試場景工具
            console.log('\n1. 測試當前場景信息...');
            const sceneInfo = await this.callTool('scene_get_current_scene');
            console.log('場景信息:', JSON.stringify(sceneInfo).substring(0, 100) + '...');
            
            // 2. 測試場景列表
            console.log('\n2. 測試場景列表...');
            const sceneList = await this.callTool('scene_get_scene_list');
            console.log('場景列表:', JSON.stringify(sceneList).substring(0, 100) + '...');
            
            // 3. 測試節點創建
            console.log('\n3. 測試創建節點...');
            const createResult = await this.callTool('node_create_node', {
                name: 'MCPTestNode_' + Date.now(),
                nodeType: 'cc.Node',
                position: { x: 0, y: 0, z: 0 }
            });
            console.log('創建節點結果:', createResult);
            
            // 解析創建節點的結果
            let nodeUuid: string | null = null;
            if (createResult.content && createResult.content[0] && createResult.content[0].text) {
                try {
                    const resultData = JSON.parse(createResult.content[0].text);
                    if (resultData.success && resultData.data && resultData.data.uuid) {
                        nodeUuid = resultData.data.uuid;
                        console.log('成功獲取節點UUID:', nodeUuid);
                    }
                } catch (e) {
                }
            }
            
            if (nodeUuid) {
                // 4. 測試查詢節點
                console.log('\n4. 測試查詢節點...');
                const queryResult = await this.callTool('node_get_node_info', {
                    uuid: nodeUuid
                });
                console.log('節點信息:', JSON.stringify(queryResult).substring(0, 100) + '...');
                
                // 5. 測試刪除節點
                console.log('\n5. 測試刪除節點...');
                const removeResult = await this.callTool('node_delete_node', {
                    uuid: nodeUuid
                });
                console.log('刪除結果:', removeResult);
            } else {
                console.log('無法從創建結果獲取節點UUID，嘗試通過名稱查找...');
                
                // 備用方案：通過名稱查找剛創建的節點
                const findResult = await this.callTool('node_find_node_by_name', {
                    name: 'MCPTestNode_' + Date.now()
                });
                
                if (findResult.content && findResult.content[0] && findResult.content[0].text) {
                    try {
                        const findData = JSON.parse(findResult.content[0].text);
                        if (findData.success && findData.data && findData.data.uuid) {
                            nodeUuid = findData.data.uuid;
                            console.log('通過名稱查找成功獲取UUID:', nodeUuid);
                        }
                    } catch (e) {
                    }
                }
                
                if (!nodeUuid) {
                    console.log('所有方式都無法獲取節點UUID，跳過後續節點操作測試');
                }
            }
            
            // 6. 測試項目工具
            console.log('\n6. 測試項目信息...');
            const projectInfo = await this.callTool('project_get_project_info');
            console.log('項目信息:', JSON.stringify(projectInfo).substring(0, 100) + '...');
            
            // 7. 測試預製體工具
            console.log('\n7. 測試預製體列表...');
            const prefabResult = await this.callTool('prefab_get_prefab_list', {
                folder: 'db://assets'
            });
            console.log('找到預製體:', prefabResult.data?.length || 0);
            
            // 8. 測試組件工具
            console.log('\n8. 測試可用組件...');
            const componentsResult = await this.callTool('component_get_available_components');
            console.log('可用組件:', JSON.stringify(componentsResult).substring(0, 100) + '...');
            
            // 9. 測試調試工具
            console.log('\n9. 測試編輯器信息...');
            const editorInfo = await this.callTool('debug_get_editor_info');
            console.log('編輯器信息:', JSON.stringify(editorInfo).substring(0, 100) + '...');
            
        } catch (error) {
            console.error('MCP 工具測試失敗:', error);
        }
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.responseHandlers.clear();
    }
}

// 導出到全局方便測試
(global as any).MCPToolTester = MCPToolTester;