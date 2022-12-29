
import * as vscode from 'vscode';
import * as fs from 'fs';

class Item extends vscode.TreeItem{

    constructor(
        public readonly label: string,
        private version: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
      ) {
        super(label, collapsibleState);
      }

};

export class NodeInventoryProvider implements vscode.TreeDataProvider<Item> {

    constructor(  ) {
        vscode.window.showInformationMessage('No item in empty inventory');
    }
    
    getTreeItem(element: Item): vscode.TreeItem {
        return element;
    }

    getChildren(element?: Item | undefined): vscode.ProviderResult<Item[]> {
        return null;
    }

};
