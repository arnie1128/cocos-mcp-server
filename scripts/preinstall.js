const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const PATH = {
    packageJSON: path.join(__dirname, "../package.json")
};

function checkCreatorTypesVersion(version) {
    try {
        // 根據平臺選擇合適的npm命令
        const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
        
        // 檢查npm命令是否可用
        const npmCheck = spawnSync(npmCmd, ["--version"], { 
            stdio: 'pipe',
            shell: process.platform === "win32"
        });
        
        if (npmCheck.error || npmCheck.status !== 0) {
            console.warn("Warning: npm command not available, skipping version check");
            return true; // 如果npm不可用，跳過檢查
        }
        
        // 獲取版本列表
        const result = spawnSync(npmCmd, ["view", "@cocos/creator-types", "versions"], { 
            stdio: 'pipe',
            shell: process.platform === "win32"
        });
        
        if (result.error || result.status !== 0) {
            console.warn("Warning: Failed to fetch @cocos/creator-types versions, skipping check");
            return true; // 如果獲取失敗，跳過檢查
        }
        
        let output = result.stdout.toString().trim();
        
        // 嘗試解析JSON
        try {
            const versions = JSON.parse(output);
            if (Array.isArray(versions)) {
                return versions.includes(version);
            } else if (typeof versions === 'string') {
                return versions.includes(version);
            }
        } catch (parseError) {
            // 如果JSON解析失敗，嘗試作為字符串處理
            return output.includes(version);
        }
        
        return false;
    } catch (error) {
        console.warn("Warning: Version check failed:", error.message);
        return true; // 出錯時跳過檢查
    }
}

function getCreatorTypesVersion() {
    try {
        // 檢查package.json文件是否存在
        if (!fs.existsSync(PATH.packageJSON)) {
            console.warn("Warning: package.json not found");
            return null;
        }
        
        const packageContent = fs.readFileSync(PATH.packageJSON, "utf8");
        const packageJson = JSON.parse(packageContent);
        
        // 檢查devDependencies是否存在
        if (!packageJson.devDependencies || !packageJson.devDependencies["@cocos/creator-types"]) {
            console.warn("Warning: @cocos/creator-types not found in devDependencies");
            return null;
        }
        
        const versionString = packageJson.devDependencies["@cocos/creator-types"];
        return versionString.replace(/^[^\d]+/, "");
    } catch (error) {
        console.warn("Warning: Failed to read package.json:", error.message);
        return null;
    }
}

function main() {
    try {
        const creatorTypesVersion = getCreatorTypesVersion();
        
        if (!creatorTypesVersion) {
            console.log("Skipping @cocos/creator-types version check");
            return;
        }
        
        if (!checkCreatorTypesVersion(creatorTypesVersion)) {
            console.log("\x1b[33mWarning:\x1b[0m");
            console.log("  @en");
            console.log("    Version check of @cocos/creator-types failed.");
            console.log(`    The definition of ${creatorTypesVersion} has not been released yet. Please export the definition to the ./node_modules directory by selecting "Developer -> Export Interface Definition" in the menu of the Creator editor.`);
            console.log("    The definition of the corresponding version will be released on npm after the editor is officially released.");
            console.log("  @zh");
            console.log("    @cocos/creator-types 版本檢查失敗。");
            console.log(`    ${creatorTypesVersion} 定義還未發佈，請先通過 Creator 編輯器菜單 "開發者 -> 導出接口定義"，導出定義到 ./node_modules 目錄。`);
            console.log("    對應版本的定義會在編輯器正式發佈後同步發佈到 npm 上。");
        }
    } catch (error) {
        console.error("Preinstall script error:", error.message);
        // 不要拋出錯誤，讓安裝繼續進行
        process.exit(0);
    }
}

// 執行主函數
main();