import { ClassRegistry, Hash, HashedObject, Identity, location, MultiMap, MutableArray, MutationEvent, MutationObserver } from '@hyper-hyper-space/core';
import { Lock } from '@hyper-hyper-space/core/dist/util/concurrency';

import { Folder, FolderEvent, FolderItem } from './Folder';
import { SpaceLink } from './SpaceLink';

enum FolderTreeEvents {
    AddItem     = 'add-item-to-tree',
    RemoveItem  = 'remove-item-from-tree',
    AddSpace    = 'add-space-to-tree',
    RemoveSpace = 'remove-space-from-tree'
}

type AddItemEvent     = { emitter: FolderTree, action: FolderTreeEvents.AddItem, path?: location<HashedObject>[], data: FolderItem };
type RemoveItemEvent  = { emitter: FolderTree, action: FolderTreeEvents.RemoveItem, path?: location<HashedObject>[], data: FolderItem };
type AddSpaceEvent    = { emitter: FolderTree, action: FolderTreeEvents.AddSpace, path?: location<HashedObject>[], data: HashedObject };
type RemoveSpaceEvent = { emitter: FolderTree, action: FolderTreeEvents.RemoveSpace, path?: location<HashedObject>[], data: HashedObject };

type Event = AddItemEvent | RemoveItemEvent | AddSpaceEvent | RemoveSpaceEvent;


type TreeChange = { what: 'add', folder: Folder, item: FolderItem, loadBatchSize?: number } | { what: 'remove', folder: Folder, itemHash: Hash } | { what: 'load-root', loadBatchSize?: number};

class FolderTree extends HashedObject {

    static className = 'hhs-home/v0/FolderTree';

    root?: Folder;

    //_allFolderItems     : Map<Hash, FolderItem>;

    _currentFolderItems : Map<Hash, FolderItem>;
    _currentSpaces      : Set<Hash>;

    _containingFolders  : MultiMap<Hash, Hash>;
    _spaceLinksPerSpace : MultiMap<Hash, Hash>;

    _treeObserver: MutationObserver;

    _changeTreeLock: Lock;
    _pendingChanges: Array<TreeChange>;

    _loadingFolders: Set<Hash>;
    _loadAllLock: Lock;

    constructor(owner?: Identity, id?: string) {
        super();

        //this._allFolderItems     = new Map();

        this._currentFolderItems = new Map();
        this._currentSpaces      = new Set();

        this._containingFolders  = new MultiMap();
        this._spaceLinksPerSpace = new MultiMap();

        this._loadingFolders     = new Set();
        this._loadAllLock        = new Lock();

        this._treeObserver = (ev: MutationEvent) => {

            //console.log('folder tree observer:')
            //console.log(ev)

            if (ev.emitter instanceof Folder) {

                const folderHash = ev.emitter.getLastHash();
                const folderEv = ev as FolderEvent;

                if (this._currentFolderItems.has(folderHash) && !this._loadingFolders.has(folderHash)) {
                    if (folderEv.action === 'add-to-folder') {
                        this.doChange({what: 'add', folder: ev.emitter, item: ev.data});
                        return true;
                    } else if (folderEv.action === 'remove-from-folder') {
                        this.doChange({what: 'remove', folder: ev.emitter, itemHash: ev.data.getLastHash()});
                        return true;
                    } else if (folderEv.action === 'rename') {
                        return false;
                    }
                }
            }

            return true;
        };

        this._changeTreeLock = new Lock();
        this._pendingChanges = [];

        if (owner !== undefined) {

            this.setAuthor(owner);

            if (id !== undefined) {
                this.setId(id);
            } else {
                this.setRandomId();
            }

            this.root = new Folder(owner, this.getDerivedFieldId('root'));

            this.init();
        }
    }

    init(): void {

        const root = this.root as Folder;

        this._currentFolderItems.set(root.getLastHash(), root);
        //this._allFolderItems.set(root.hash(), root);
        
        root.addObserver(this._treeObserver);
    }

    getClassName(): string {
        return FolderTree.className;
    }

    private async doChange(change: TreeChange) {

        this._pendingChanges.push(change);

        if (this._changeTreeLock.acquire()) {
            try {

                while (this._pendingChanges.length > 0) {
                    const next = this._pendingChanges.shift() as TreeChange;

                    if (next.what === 'add') {
                        await this.onAddingToFolder(next.folder, next.item, next.loadBatchSize);
                    } else if (next.what === 'remove') {
                        this.onRemovingFromFolder(next.folder, next.itemHash);
                    } else if (next.what === 'load-root') {
                        await this.loadRoot();
                    }
                }

            } finally {
                this._changeTreeLock.release();
            }
        }
    }

    private async loadRoot() {

        const rootHash = this.root?.getLastHash() as Hash;
        this._loadingFolders.add(rootHash);
        try {
            await this.root?.loadAllChanges();
        } finally {
            this._loadingFolders.delete(rootHash);
        }

        for (const nestedItem of (this.root?.items as MutableArray<FolderItem>).contents()) {
            await this.doChange({what: 'add', folder: this.root as Folder, item: nestedItem});
            //await this.onAddingToFolder(item, nestedItem);
        }

    }

    private async onAddingToFolder(folder: Folder, item: FolderItem, loadBatchSize?: number) {
        const folderHash = folder.getLastHash();
        const itemHash = item.getLastHash();

        if (this._currentFolderItems.has(folderHash)) {

            this._containingFolders.add(itemHash, folderHash);

            if (!this._currentFolderItems.has(itemHash)) {

                this._currentFolderItems.set(itemHash, item);

                item.toggleWatchForChanges(this.isWatchingForChanges())

                if (item.isWatchingForChanges()) {
                    this._loadingFolders.add(itemHash);
                    try {
                        await item.loadAllChanges(loadBatchSize);
                    } finally {
                        this._loadingFolders.delete(itemHash);
                    } 
                }

                // No race: if the treeObserver was already called, and missed because itemHash is in _loadingFolders,
                // then the object has already been modified and the change will be reflected on nestedItems below.

                this._mutationEventSource?.emit({emitter: this, action: FolderTreeEvents.AddItem, data: item} as AddItemEvent)
            
                if (item instanceof Folder) {

                    item.addObserver(this._treeObserver);

                    for (const nestedItem of (item.items as MutableArray<FolderItem>).contents()) {
                        await this.doChange({what: 'add', folder: item, item: nestedItem});
                        //await this.onAddingToFolder(item, nestedItem);
                    }
                } else if (item instanceof SpaceLink) {

                    const entryPointHash = item.spaceEntryPoint?.getLastHash() as Hash;

                    const isNewSpace = !this._currentSpaces.has(entryPointHash);
                    
                    this._spaceLinksPerSpace.add(entryPointHash, itemHash);

                    if (isNewSpace) {
                        this._currentSpaces.add(entryPointHash);
                        this._mutationEventSource?.emit({emitter: this, action: FolderTreeEvents.AddSpace, data: item.spaceEntryPoint} as AddSpaceEvent)
                    }
                }
            
            }            
        }
    }

    private onRemovingFromFolder(folder: Folder, itemHash: Hash) {
        
        const folderHash = folder.getLastHash();

        if (this._currentFolderItems.has(itemHash)) {

            this._containingFolders.delete(itemHash, folderHash);
            if (!this._containingFolders.hasKey(itemHash)) {

                const item = this._currentFolderItems.get(itemHash);

                this._currentFolderItems.delete(itemHash);
                this._mutationEventSource?.emit({emitter: this, action: FolderTreeEvents.RemoveItem, data: item} as RemoveItemEvent);

                if (item instanceof SpaceLink) {

                    const spaceEntryHash = item.spaceEntryPoint?.getLastHash() as Hash;

                    this._spaceLinksPerSpace.delete(spaceEntryHash, itemHash);
                    if (!this._spaceLinksPerSpace.hasKey(spaceEntryHash)) {
                        this._currentSpaces.delete(spaceEntryHash);
                        this._mutationEventSource?.emit({emitter: this, action: FolderTreeEvents.RemoveSpace, data: item.spaceEntryPoint} as RemoveSpaceEvent)
                    }
    
                } else if (item instanceof Folder) {

                    item.removeObserver(this._treeObserver);

                    for (const nestedItem of (folder.items as MutableArray<FolderItem>)?.contents()) {

                        const nestedItemHash = nestedItem.getLastHash();

                        this.onRemovingFromFolder(item, nestedItemHash);
                    }
                }
            }
        }
    }

    toggleWatchForChanges(enabled: boolean): boolean {

        
        const before = this._boundToStore;

        this._boundToStore = enabled;
        
        for (const folder of this._currentFolderItems.values()) {
            folder.toggleWatchForChanges(enabled);
        }

        return before;

        /*const before = super.toggleWatchForChanges(enabled);

        for (const folder of this._allFolderItems.values()) {
            folder.toggleWatchForChanges(enabled);
            if (enabled && !before) {
                folder.loadAllChanges();
            }
        }

        return enabled;
        */
    }

    async loadAndWatchForChanges(loadBatchSize=128): Promise<void> {
        this.watchForChanges();
        await this.loadAllChanges(loadBatchSize);
    }

    async loadAllChanges(loadBatchSize=128) {
        await this.doChange({what:'load-root', loadBatchSize: loadBatchSize});
    }

    /*private async loadAllChangesToFolder(folder: Folder, loadBatchSize: number) {
        const folderHash = folder.getLastHash();

        const oldContents = new Set(folder.items?.contentHashes() || []);
        
        this._loadingFolders.add(folderHash);

        try {
            await folder.loadAllChanges(loadBatchSize);
        } finally {
            this._loadingFolders.delete(folderHash);
        } 

        

        // No race: if the treeObserver was already called, and missed becose itemHash is in _loadingFolders,
        // then the object has already been modified and the change will be reflected on newContents below.

        const newContents = new Map(folder.items?.contents().map((item:FolderItem)=>[item.getLastHash(), item]));

        const toReload = new Array<Folder>();

        for (const [itemHash, item] of newContents.entries()) {
            if (!oldContents.has(itemHash)) {
                await this.doChange({what: 'add', folder: folder, item: item});

                if (item instanceof Folder) {
                    toReload.push(item);
                }

            }
        }

        for (const itemHash of oldContents.values()) {
            if (!newContents.has(itemHash)) {
                await this.doChange({what:'remove', folder: folder, itemHash: itemHash});
            }
        }

        for (const childFolder of toReload) {
            await this.loadAllChangesToFolder(childFolder, loadBatchSize);
        }
        
    }*/

    async validate(_references: Map<string, HashedObject>): Promise<boolean> {

        if (this.getAuthor() === undefined) {
            return false;
        }

        if (!(this.root instanceof Folder)) {
            return false;
        }

        if (!this.getAuthor()?.equals(this.root.getAuthor())) {
            return false;
        }

        if (!this.checkDerivedField('root')) {
            return false;
        }

        return true;
    }

    hasCurrentItemByHash(hash: Hash) {
        return this._currentFolderItems.has(hash); 
    }

    currentItems(): IterableIterator<FolderItem> {

        return this._currentFolderItems.values();
    }

    hasCurrentSpaceByHash(hash: Hash) {
        return this._currentSpaces.has(hash);
    }

    currentSpaces(): IterableIterator<Hash> {
        return this._currentSpaces.values();
    }

    currentLinksForSpace(spaceEntryHash: Hash): Array<SpaceLink> {

        return Array.from(this._spaceLinksPerSpace.get(spaceEntryHash)).map(
                        (linkHash: Hash) => this._currentFolderItems.get(linkHash) as SpaceLink)

    }

    getPathsForItemHash(itemHash: Hash) : Set<Array<FolderItem>> {

        const paths = new Set<Array<FolderItem>>();

        for (const pathHash of this.getPathHashesForItemHash(itemHash).values()) {
            paths.add(pathHash.map((hash: Hash) => this._currentFolderItems.get(hash) as FolderItem));
        }

        return paths;
    }

    getPathHashesForItemHash(itemHash: Hash): Set<Array<Hash>> {
        const pathHashes = new Set<Array<Hash>>();

        const rootHash = this.root?.getLastHash();

        if (itemHash === rootHash) {
            return new Set([[rootHash]]);
        } else {
            for (const parentHash of this._containingFolders.get(itemHash)) {
                for (const parentPath of this.getPathHashesForItemHash(parentHash)) {
                    if (parentPath.indexOf(itemHash) < 0) {
                        parentPath.push(itemHash);
                        pathHashes.add(parentPath);
                    }
                }
            }
    
            return pathHashes;    
        }

    }
}

ClassRegistry.register(FolderTree.className, FolderTree);

export { FolderTree, Event as FolderTreeEvent, FolderTreeEvents, AddItemEvent as AddItemToTreeEvent, RemoveItemEvent as RemoveItemFromTreeEvent, AddSpaceEvent as AddSpaceToTreeEvent, RemoveSpaceEvent as RemoveSpaceFromTreeEvent };