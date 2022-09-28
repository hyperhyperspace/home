import { ClassRegistry, Hash, HashedObject, Identity, location, MutableArray, MutableReference, MutationEvent, MutationObserver, Types } from '@hyper-hyper-space/core';
import { MutableContentEvents } from '@hyper-hyper-space/core/dist/data/model/mutable/MutableObject';

import { SpaceLink } from './SpaceLink';

type FolderItem = Folder | SpaceLink;

type AddToFolderEvent = {emitter: Folder, action: 'add-to-folder', path?: location<HashedObject>[], data: FolderItem };
type RemoveFromFolderEvent = {emitter: Folder, action: 'remove-from-folder', path?: location<HashedObject>[], data: Hash};
type RenameFolderEvent = {emitter: Folder, action: 'rename', path?: location<HashedObject>[], data: string};

type FolderEvent = AddToFolderEvent | RemoveFromFolderEvent | RenameFolderEvent;

class Folder extends HashedObject {

    static className = 'hhs-home/v0/Folder';

    name?: MutableReference<string>;
    items?: MutableArray<FolderItem>

    _contentsObserver: MutationObserver;

    _watchForItemNameChanges: boolean;

    constructor(owner?: Identity, id?: string) {
        super();

        this._contentsObserver = (ev: MutationEvent) => {

            //console.log('folder contents observer:')
            //console.log(ev)

            if (ev.emitter === this.items) {
                if (ev.action === MutableContentEvents.AddObject) {
                    if (this._watchForItemNameChanges) {
                        (ev.data.name as MutableReference<string>)?.loadAndWatchForChanges();
                    }
                    this._mutationEventSource?.emit({emitter: this, action: 'add-to-folder', data: ev.data} as AddToFolderEvent)
                } else if (ev.action === MutableContentEvents.RemoveObject) {
                    if (this._watchForItemNameChanges) {
                        (ev.data.name as MutableReference<string>)?.dontWatchForChanges();
                    }
                    this._mutationEventSource?.emit({emitter: this, action: 'remove-from-folder', data: ev.data} as RemoveFromFolderEvent)
                }
            } else if (ev.emitter === this.name) {
                if (ev.action === 'update') {
                    this._mutationEventSource?.emit({emitter: this, action:'rename', data: ev.data} as RenameFolderEvent);
                    return true;
                }   
            }/* else {

                if (ev.action === 'rename') {
                    const idx = this.items?.indexOfByHash(ev.emitter?.getLastHash());

                    if (idx !== undefined && idx >= 0) {
                        
                        
                    }
    
                }
            }*/

            return false;
        };

        this._watchForItemNameChanges = false;

        if (owner !== undefined) {
            if (id === undefined) {
                this.setRandomId();
            } else {
                this.setId(id);
            }
            
            const name = new MutableReference({writer: owner});
            name.typeConstraints = ['string'];
            this.addDerivedField('name', name);
            
            const items = new MutableArray<HashedObject>({writer: owner, duplicates: false});
            items.typeConstraints = [Folder.className, SpaceLink.className];
            this.addDerivedField('items', items);

            this.setAuthor(owner);

            this.init();
        }

    }

    getClassName(): string {
        return Folder.className;
    }

    init(): void {
        this.addMutationObserver(this._contentsObserver);
    }

    async validate(references: Map<string, HashedObject>): Promise<boolean> {
        references;

        if (this.getAuthor() === undefined) {
            return false;
        }

        if (!this.checkDerivedField('name')) {
            return false;
        }

        if (!(this.name instanceof MutableReference)) {
            return false;
        }

        if (this.name.getAuthor() !== undefined) {
            return false;
        }

        if (!Types.checkTypeConstraint(this.name?.typeConstraints, ['string'])) {
            return false;
        }

        if (!this.name.hasSingleWriter() || !(this.getAuthor()?.equals(this.name.getSingleWriter()))) {
            return false;
        }

        if (!this.checkDerivedField('items')) {
            return false;
        }

        if (!(this.items instanceof MutableArray)) {
            return false;
        }

        if (this.items.getAuthor() !== undefined) {
            return false;
        }

        if (this.items.duplicates) {
            return false;
        }

        if (!Types.checkTypeConstraint(this.items.typeConstraints, [Folder.className, SpaceLink.className])) {
            return false;
        }

        if (!this.items?.hasSingleWriter()) {
            return false;
        }

        if (!(this.getAuthor()?.equals(this.items.getSingleWriter()))) {
            return false;
        }

        return true;

    }

    async loadItemNamesAndWatchForChanges() {
        
        this.cascadeMutableContentEvents();

        this._watchForItemNameChanges = true;

        for (const item of (this.items as MutableArray<FolderItem>).contents()) {
            await item.name?.loadAndWatchForChanges();
        }
    }

    dontWatchForItemNameChanges() {

        this.dontCascadeMutableContentEvents();

        this._watchForItemNameChanges = false;

        for (const item of (this.items as MutableArray<FolderItem>).contents()) {
            item.name?.dontWatchForChanges();
        }

    }

    isWatchingForItemNameChanges() {
        return this._watchForItemNameChanges;
    }

    ownEventsFilter(): (ev: MutationEvent) => boolean {
        const isEventForFolder = (ev: MutationEvent) => 
        (ev.emitter.getLastHash() === this.getLastHash() || 
        ( this.items !== undefined && 
          this.items.indexOfByHash(ev.emitter.getLastHash()) >= 0));

        return isEventForFolder;
    }

}

ClassRegistry.register(Folder.className, Folder);

export { Folder, FolderItem, FolderEvent, AddToFolderEvent, RemoveFromFolderEvent, RenameFolderEvent };