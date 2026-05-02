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
exports.extractCcclassNames = extractCcclassNames;
exports.resolveCcclassFromAsset = resolveCcclassFromAsset;
const fs = __importStar(require("fs"));
/**
 * Extract class names from Cocos @ccclass decorators.
 * Matches @ccclass('Name'), @ccclass("Name"), and @ccclass(`Name`).
 */
function extractCcclassNames(content) {
    const classNames = [];
    const ccclassRegex = /@ccclass\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
    let match;
    while ((match = ccclassRegex.exec(content)) !== null) {
        const className = match[1].trim();
        if (className && !classNames.includes(className)) {
            classNames.push(className);
        }
    }
    return classNames;
}
async function resolveCcclassFromAsset(urlOrUuid) {
    const script = urlOrUuid.trim();
    if (!script) {
        throw new Error('script must be a non-empty asset URL or UUID');
    }
    const isUrl = script.startsWith('db://');
    const assetUrl = isUrl
        ? script
        : await Editor.Message.request('asset-db', 'query-url', script);
    if (!assetUrl) {
        throw new Error(`Script asset URL not found for ${script}`);
    }
    const assetUuid = isUrl
        ? await Editor.Message.request('asset-db', 'query-uuid', assetUrl)
        : script;
    if (!assetUuid) {
        throw new Error(`Script asset UUID not found for ${assetUrl}`);
    }
    const assetPath = await Editor.Message.request('asset-db', 'query-path', assetUrl);
    if (!assetPath) {
        throw new Error(`Script asset path not found for ${assetUrl}`);
    }
    if (!assetPath.toLowerCase().endsWith('.ts')) {
        throw new Error(`Script asset must resolve to a .ts file: ${assetPath}`);
    }
    const content = await fs.promises.readFile(assetPath, 'utf8');
    return {
        classNames: extractCcclassNames(content),
        assetPath,
        assetUuid,
        assetUrl,
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2NjbGFzcy1leHRyYWN0b3IuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zb3VyY2UvbGliL2NjY2xhc3MtZXh0cmFjdG9yLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBYUEsa0RBYUM7QUFFRCwwREFvQ0M7QUFoRUQsdUNBQXlCO0FBU3pCOzs7R0FHRztBQUNILFNBQWdCLG1CQUFtQixDQUFDLE9BQWU7SUFDL0MsTUFBTSxVQUFVLEdBQWEsRUFBRSxDQUFDO0lBQ2hDLE1BQU0sWUFBWSxHQUFHLDJDQUEyQyxDQUFDO0lBRWpFLElBQUksS0FBSyxDQUFDO0lBQ1YsT0FBTyxDQUFDLEtBQUssR0FBRyxZQUFZLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLEtBQUssSUFBSSxFQUFFLENBQUM7UUFDbkQsTUFBTSxTQUFTLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ2xDLElBQUksU0FBUyxJQUFJLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDO1lBQy9DLFVBQVUsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDL0IsQ0FBQztJQUNMLENBQUM7SUFFRCxPQUFPLFVBQVUsQ0FBQztBQUN0QixDQUFDO0FBRU0sS0FBSyxVQUFVLHVCQUF1QixDQUFDLFNBQWlCO0lBQzNELE1BQU0sTUFBTSxHQUFHLFNBQVMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztJQUNoQyxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7UUFDVixNQUFNLElBQUksS0FBSyxDQUFDLDhDQUE4QyxDQUFDLENBQUM7SUFDcEUsQ0FBQztJQUVELE1BQU0sS0FBSyxHQUFHLE1BQU0sQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDekMsTUFBTSxRQUFRLEdBQUcsS0FBSztRQUNsQixDQUFDLENBQUMsTUFBTTtRQUNSLENBQUMsQ0FBQyxNQUFNLE1BQU0sQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLFVBQVUsRUFBRSxXQUFXLEVBQUUsTUFBTSxDQUFrQixDQUFDO0lBQ3JGLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUNaLE1BQU0sSUFBSSxLQUFLLENBQUMsa0NBQWtDLE1BQU0sRUFBRSxDQUFDLENBQUM7SUFDaEUsQ0FBQztJQUVELE1BQU0sU0FBUyxHQUFHLEtBQUs7UUFDbkIsQ0FBQyxDQUFDLE1BQU0sTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsVUFBVSxFQUFFLFlBQVksRUFBRSxRQUFRLENBQWtCO1FBQ25GLENBQUMsQ0FBQyxNQUFNLENBQUM7SUFDYixJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7UUFDYixNQUFNLElBQUksS0FBSyxDQUFDLG1DQUFtQyxRQUFRLEVBQUUsQ0FBQyxDQUFDO0lBQ25FLENBQUM7SUFFRCxNQUFNLFNBQVMsR0FBRyxNQUFNLE1BQU0sQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLFVBQVUsRUFBRSxZQUFZLEVBQUUsUUFBUSxDQUFrQixDQUFDO0lBQ3BHLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztRQUNiLE1BQU0sSUFBSSxLQUFLLENBQUMsbUNBQW1DLFFBQVEsRUFBRSxDQUFDLENBQUM7SUFDbkUsQ0FBQztJQUNELElBQUksQ0FBQyxTQUFTLENBQUMsV0FBVyxFQUFFLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7UUFDM0MsTUFBTSxJQUFJLEtBQUssQ0FBQyw0Q0FBNEMsU0FBUyxFQUFFLENBQUMsQ0FBQztJQUM3RSxDQUFDO0lBRUQsTUFBTSxPQUFPLEdBQUcsTUFBTSxFQUFFLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxTQUFTLEVBQUUsTUFBTSxDQUFDLENBQUM7SUFDOUQsT0FBTztRQUNILFVBQVUsRUFBRSxtQkFBbUIsQ0FBQyxPQUFPLENBQUM7UUFDeEMsU0FBUztRQUNULFNBQVM7UUFDVCxRQUFRO0tBQ1gsQ0FBQztBQUNOLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBmcyBmcm9tICdmcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgUmVzb2x2ZWRDY2NsYXNzQXNzZXQge1xuICAgIGNsYXNzTmFtZXM6IHN0cmluZ1tdO1xuICAgIGFzc2V0UGF0aDogc3RyaW5nO1xuICAgIGFzc2V0VXVpZDogc3RyaW5nO1xuICAgIGFzc2V0VXJsOiBzdHJpbmc7XG59XG5cbi8qKlxuICogRXh0cmFjdCBjbGFzcyBuYW1lcyBmcm9tIENvY29zIEBjY2NsYXNzIGRlY29yYXRvcnMuXG4gKiBNYXRjaGVzIEBjY2NsYXNzKCdOYW1lJyksIEBjY2NsYXNzKFwiTmFtZVwiKSwgYW5kIEBjY2NsYXNzKGBOYW1lYCkuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBleHRyYWN0Q2NjbGFzc05hbWVzKGNvbnRlbnQ6IHN0cmluZyk6IHN0cmluZ1tdIHtcbiAgICBjb25zdCBjbGFzc05hbWVzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGNvbnN0IGNjY2xhc3NSZWdleCA9IC9AY2NjbGFzc1xccypcXChcXHMqWydcImBdKFteJ1wiYF0rKVsnXCJgXVxccypcXCkvZztcblxuICAgIGxldCBtYXRjaDtcbiAgICB3aGlsZSAoKG1hdGNoID0gY2NjbGFzc1JlZ2V4LmV4ZWMoY29udGVudCkpICE9PSBudWxsKSB7XG4gICAgICAgIGNvbnN0IGNsYXNzTmFtZSA9IG1hdGNoWzFdLnRyaW0oKTtcbiAgICAgICAgaWYgKGNsYXNzTmFtZSAmJiAhY2xhc3NOYW1lcy5pbmNsdWRlcyhjbGFzc05hbWUpKSB7XG4gICAgICAgICAgICBjbGFzc05hbWVzLnB1c2goY2xhc3NOYW1lKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBjbGFzc05hbWVzO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcmVzb2x2ZUNjY2xhc3NGcm9tQXNzZXQodXJsT3JVdWlkOiBzdHJpbmcpOiBQcm9taXNlPFJlc29sdmVkQ2NjbGFzc0Fzc2V0PiB7XG4gICAgY29uc3Qgc2NyaXB0ID0gdXJsT3JVdWlkLnRyaW0oKTtcbiAgICBpZiAoIXNjcmlwdCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ3NjcmlwdCBtdXN0IGJlIGEgbm9uLWVtcHR5IGFzc2V0IFVSTCBvciBVVUlEJyk7XG4gICAgfVxuXG4gICAgY29uc3QgaXNVcmwgPSBzY3JpcHQuc3RhcnRzV2l0aCgnZGI6Ly8nKTtcbiAgICBjb25zdCBhc3NldFVybCA9IGlzVXJsXG4gICAgICAgID8gc2NyaXB0XG4gICAgICAgIDogYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktdXJsJywgc2NyaXB0KSBhcyBzdHJpbmcgfCBudWxsO1xuICAgIGlmICghYXNzZXRVcmwpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBTY3JpcHQgYXNzZXQgVVJMIG5vdCBmb3VuZCBmb3IgJHtzY3JpcHR9YCk7XG4gICAgfVxuXG4gICAgY29uc3QgYXNzZXRVdWlkID0gaXNVcmxcbiAgICAgICAgPyBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS11dWlkJywgYXNzZXRVcmwpIGFzIHN0cmluZyB8IG51bGxcbiAgICAgICAgOiBzY3JpcHQ7XG4gICAgaWYgKCFhc3NldFV1aWQpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBTY3JpcHQgYXNzZXQgVVVJRCBub3QgZm91bmQgZm9yICR7YXNzZXRVcmx9YCk7XG4gICAgfVxuXG4gICAgY29uc3QgYXNzZXRQYXRoID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktcGF0aCcsIGFzc2V0VXJsKSBhcyBzdHJpbmcgfCBudWxsO1xuICAgIGlmICghYXNzZXRQYXRoKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgU2NyaXB0IGFzc2V0IHBhdGggbm90IGZvdW5kIGZvciAke2Fzc2V0VXJsfWApO1xuICAgIH1cbiAgICBpZiAoIWFzc2V0UGF0aC50b0xvd2VyQ2FzZSgpLmVuZHNXaXRoKCcudHMnKSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFNjcmlwdCBhc3NldCBtdXN0IHJlc29sdmUgdG8gYSAudHMgZmlsZTogJHthc3NldFBhdGh9YCk7XG4gICAgfVxuXG4gICAgY29uc3QgY29udGVudCA9IGF3YWl0IGZzLnByb21pc2VzLnJlYWRGaWxlKGFzc2V0UGF0aCwgJ3V0ZjgnKTtcbiAgICByZXR1cm4ge1xuICAgICAgICBjbGFzc05hbWVzOiBleHRyYWN0Q2NjbGFzc05hbWVzKGNvbnRlbnQpLFxuICAgICAgICBhc3NldFBhdGgsXG4gICAgICAgIGFzc2V0VXVpZCxcbiAgICAgICAgYXNzZXRVcmwsXG4gICAgfTtcbn1cbiJdfQ==