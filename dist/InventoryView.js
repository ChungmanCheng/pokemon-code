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
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NodeInventoryProvider = void 0;
const vscode = __importStar(require("vscode"));
class NodeInventoryProvider {
    constructor(state) {
        this.state = state;
        this.emitter = new vscode.EventEmitter();
        this.onDidChangeTreeData = this.emitter.event;
    }
    getTreeItem(element) { return element; }
    getChildren() {
        return this.state().items.map(item => {
            const row = new vscode.TreeItem(item.name);
            row.description = `× ${item.amount}`;
            row.iconPath = new vscode.ThemeIcon(item.name === 'Razzberry' ? 'gift' : 'circle-large-outline');
            row.tooltip = item.name === 'Razzberry' ? 'Used automatically to improve capture odds.' : 'Used automatically to collect new Pokémon.';
            return row;
        });
    }
    refresh() { this.emitter.fire(); }
    dispose() { this.emitter.dispose(); }
}
exports.NodeInventoryProvider = NodeInventoryProvider;
//# sourceMappingURL=InventoryView.js.map