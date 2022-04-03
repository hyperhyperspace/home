import { ClassRegistry, Hash, HashedObject, Identity, location, MultiMap, MutableArray, MutationEvent, MutationObserver } from '@hyper-hyper-space/core';

import { Folder, FolderEvent, FolderItem } from './Folder';
import { SpaceLink } from './SpaceLink';

type AddItemEvent     = { emitter: FolderTree, action: 'add-item-to-tree', path?: location<HashedObject>[], data: FolderItem };
type RemoveItemEvent  = { emitter: FolderTree, action: 'remove-item-from-tree', path?: location<HashedObject>[], data: FolderItem };
type AddSpaceEvent    = { emitter: FolderTree, action: 'add-space-to-tree', path?: location<HashedObject>[], data: Hash };
type RemoveSpaceEvent = { emitter: FolderTree, action: 'remove-space-from-tree', path?: location<HashedObject>[], data: Hash };

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

    _watchingForChanges = false;

    constructor(owner?: Identity, id?: string) {
        super();

        if (owner !== undefined) {

            this.setAuthor(owner);

            if (id !== undefined) {
                this.setId(id);
            } else {
                this.setRandomId();
            }

            this.root = new Folder(owner, this.getDerivedFieldId('root'));
        }

        this._allFolderItems     = new Map();

        this._currentFolderItems = new Set();
        this._currentSpaces      = new Set();

        this._containingFolders  = new MultiMap();
        this._spaceLinksPerSpace = new MultiMap();

        this._folderContentsObserver = {
            callback: (ev: MutationEvent) => {
                if (ev.emitter instanceof Folder) {

                    const folderHash = ev.emitter.hash();
                    const folderEv = ev as FolderEvent;

                    if (this._currentFolderItems.has(folderHash)) {
                        if (folderEv.action === 'add-to-folder') {
                            this.onAddingToFolder(ev.emitter, ev.data);
                        } else if (folderEv.action === 'remove-from-folder') {
                            this.onRemovingFromFolder(ev.emitter, ev.data);
                        }
                    }
                }
            }
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

            if (item.watchForChanges(this._watchingForChanges)) {
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
                this._mutationEventSource?.emit({emitter: this, action: 'add-item-to-tree', data: item} as AddItemEvent)
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
                    this._mutationEventSource?.emit({emitter: this, action: 'add-space-to-tree', data: item.spaceEntryHash} as AddSpaceEvent)
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
                this._mutationEventSource?.emit({emitter: this, action: 'remove-item-from-tree', data: item} as RemoveItemEvent);

                if (item instanceof SpaceLink) {

                    const spaceEntryHash = item.spaceEntryHash as Hash;

                    this._spaceLinksPerSpace.delete(spaceEntryHash, itemHash);
                    if (!this._spaceLinksPerSpace.hasKey(spaceEntryHash)) {
                        this._currentSpaces.delete(spaceEntryHash);
                        this._mutationEventSource?.emit({emitter: this, action: 'remove-space-from-tree', data: item.spaceEntryHash} as RemoveSpaceEvent)
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

    watchForChanges(auto: boolean): boolean {

        this._watchingForChanges = auto;

        for (const folder of this._allFolderItems.values()) {
            folder.watchForChanges(auto);
            if (auto) {
                folder.loadAllChanges();
            }
        }

        return auto;
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

}

ClassRegistry.register(FolderTree.className, FolderTree);

export { FolderTree, Event as FolderTreeEvent, AddItemEvent as AddItemToTreeEvent, RemoveItemEvent as RemoveItemFromTreeEvent, AddSpaceEvent as AddSpaceToTreeEvent, RemoveSpaceEvent as RemoveSpaceFromTreeEvent };