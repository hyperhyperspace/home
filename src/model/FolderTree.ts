import { ClassRegistry, Hash, HashedObject, Identity, location, MultiMap, MutableArray, MutationEvent, MutationObserver } from '@hyper-hyper-space/core';

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
type AddSpaceEvent    = { emitter: FolderTree, action: FolderTreeEvents.AddSpace, path?: location<HashedObject>[], data: Hash };
type RemoveSpaceEvent = { emitter: FolderTree, action: FolderTreeEvents.RemoveSpace, path?: location<HashedObject>[], data: Hash };

type Event = AddItemEvent | RemoveItemEvent | AddSpaceEvent | RemoveSpaceEvent;

class FolderTree extends HashedObject {

    static className = 'hhs-home/v0/FolderTree';

    root?: Folder;

    _allFolderItems     : Map<Hash, FolderItem>;

    _currentFolderItems : Set<Hash>;
    _currentSpaces      : Set<Hash>;

    _containingFolders  : MultiMap<Hash, Hash>;
    _spaceLinksPerSpace : MultiMap<Hash, Hash>;

    _folderContentsObserver: MutationObserver;

    constructor(owner?: Identity, id?: string) {
        super();

        this._allFolderItems     = new Map();

        this._currentFolderItems = new Set();
        this._currentSpaces      = new Set();

        this._containingFolders  = new MultiMap();
        this._spaceLinksPerSpace = new MultiMap();

        this._folderContentsObserver = (ev: MutationEvent) => {

            //console.log('folder tree observer:')
            //console.log(ev)

            if (ev.emitter instanceof Folder) {

                const folderHash = ev.emitter.hash();
                const folderEv = ev as FolderEvent;

                if (this._currentFolderItems.has(folderHash)) {
                    if (folderEv.action === 'add-to-folder') {
                        this.onAddingToFolder(ev.emitter, ev.data);
                        return true;
                    } else if (folderEv.action === 'remove-from-folder') {
                        this.onRemovingFromFolder(ev.emitter, ev.data);
                        return true;
                    }
                }
            }

            return false;
        };

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

        this._currentFolderItems.add(root.hash());
        this._allFolderItems.set(root.hash(), root);
        
        root.addMutationObserver(this._folderContentsObserver);
    }

    getClassName(): string {
        return FolderTree.className;
    }

    private onAddingToFolder(folder: Folder, item: FolderItem) {
        const folderHash = folder.getLastHash();
        const itemHash = item.getLastHash();

        if (!this._allFolderItems.has(itemHash)) {

            this._allFolderItems.set(itemHash, item);

            if (item.toggleWatchForChanges(this.isWatchingForChanges())) {
                item.loadAllChanges();
            }
            
        } else {
            item = this._allFolderItems.get(itemHash) as FolderItem;
        }

        if (this._currentFolderItems.has(folderHash)) {

            this._containingFolders.add(itemHash, folderHash);

            const isNew = !this._currentFolderItems.has(itemHash);

            this._currentFolderItems.add(itemHash);

            if (isNew) {
                this._mutationEventSource?.emit({emitter: this, action: FolderTreeEvents.AddItem, data: item} as AddItemEvent)
            }

            if (item instanceof Folder) {
                
                for (const nestedItem of (item.items as MutableArray<FolderItem>).contents()) {
                    this.onAddingToFolder(item, nestedItem);
                }

                item.addMutationObserver(this._folderContentsObserver);
                 
            } else if (item instanceof SpaceLink) {

                const isNew = this._currentSpaces.has(item.spaceEntryHash as Hash);

                this._currentSpaces.add(item.spaceEntryHash as Hash);

                if (isNew) {
                    this._mutationEventSource?.emit({emitter: this, action: FolderTreeEvents.AddSpace, data: item.spaceEntryHash} as AddSpaceEvent)
                }
            }

        }
    }

    private onRemovingFromFolder(folder: Folder, itemHash: Hash) {
        
        const folderHash = folder.getLastHash();

        if (this._currentFolderItems.has(itemHash)) {

            const item = this._allFolderItems.get(itemHash);

            this._containingFolders.delete(itemHash, folderHash);
            if (!this._containingFolders.hasKey(itemHash)) {

                this._currentFolderItems.delete(itemHash);
                this._mutationEventSource?.emit({emitter: this, action: FolderTreeEvents.RemoveItem, data: item} as RemoveItemEvent);

                if (item instanceof SpaceLink) {

                    const spaceEntryHash = item.spaceEntryHash as Hash;

                    this._spaceLinksPerSpace.delete(spaceEntryHash, itemHash);
                    if (!this._spaceLinksPerSpace.hasKey(spaceEntryHash)) {
                        this._currentSpaces.delete(spaceEntryHash);
                        this._mutationEventSource?.emit({emitter: this, action: FolderTreeEvents.RemoveSpace, data: item.spaceEntryHash} as RemoveSpaceEvent)
                    }
    
                } else if (item instanceof Folder) {

                    item.removeMutationObserver(this._folderContentsObserver);

                    for (const nestedItem of (folder.items as MutableArray<FolderItem>)?.contents()) {

                        const nestedItemHash = nestedItem.getLastHash();

                        this.onRemovingFromFolder(item, nestedItemHash);
                    }
                }
            }
        }
    }

    toggleWatchForChanges(enabled: boolean): boolean {

        super.toggleWatchForChanges(enabled);

        for (const folder of this._allFolderItems.values()) {
            folder.toggleWatchForChanges(enabled);
            if (enabled) {
                folder.loadAllChanges();
            }
        }

        return enabled;
    }

    async loadAllChanges(loadBatchSize=128) {
        for (const folder of this._allFolderItems.values()) {
            await folder.loadAllChanges(loadBatchSize);
        }
    }

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

    allItems(): IterableIterator<FolderItem> {
        return this._allFolderItems.values();
    }
}

ClassRegistry.register(FolderTree.className, FolderTree);

export { FolderTree, Event as FolderTreeEvent, FolderTreeEvents, AddItemEvent as AddItemToTreeEvent, RemoveItemEvent as RemoveItemFromTreeEvent, AddSpaceEvent as AddSpaceToTreeEvent, RemoveSpaceEvent as RemoveSpaceFromTreeEvent };