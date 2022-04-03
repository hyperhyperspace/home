import { ArrayMutationEvent, ClassRegistry, Hash, HashedObject, Identity, location, MutableArray, MutableReference, MutationEvent, MutationObserver, Types } from '@hyper-hyper-space/core';

import { SpaceLink } from './SpaceLink';

type FolderItem = Folder | SpaceLink;

type AddToFolderEvent = {emitter: Folder, action: 'add-to-folder', path?: location<HashedObject>[], data: FolderItem };
type RemoveFromFolderEvent = {emitter: Folder, action: 'remove-from-folder', path?: location<HashedObject>[], data: Hash};

type FolderEvent = AddToFolderEvent | RemoveFromFolderEvent;

class Folder extends HashedObject {

    static className = 'hhs-home/v0/Folder';

    name?: MutableReference<string>;
    items?: MutableArray<FolderItem>

    _folderContentsObserver: MutationObserver;

    constructor(owner?: Identity, id?: string) {
        super();

        if (owner !== undefined) {
            if (id === undefined) {
                this.setRandomId();
            } else {
                this.setId(id);
            }
            
            const name = new MutableReference();
            name.typeConstraints = ['string'];
            name.setAuthor(owner);
            this.addDerivedField('name', name);
            
            const contents = new MutableArray<HashedObject>(false);
            contents.typeConstraints = [Folder.className, SpaceLink.className];
            contents.setAuthor(owner);
            this.addDerivedField('contents', contents);

            this.setAuthor(owner);
        }

        this._folderContentsObserver = { 

            callback: (ev: MutationEvent) => {
                if (ev.emitter === this.items) {
                    const arrayEv = ev as ArrayMutationEvent<FolderItem>;
                    if (ev.action === 'insert') {
                        this._mutationEventSource?.emit({emitter: this, action: 'add-to-folder', data: arrayEv.data} as AddToFolderEvent)
                    } else if (ev.action === 'delete') {
                        this._mutationEventSource?.emit({emitter: this, action: 'remove-from-folder', data: arrayEv.data} as RemoveFromFolderEvent)
                    }
                }
            }
        };
    }

    getClassName(): string {
        return Folder.className;
    }

    init(): void {
        
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

        if (!Types.checkTypeConstraint(this.name?.typeConstraints, ['string'])) {
            return false;
        }

        if (!(this.getAuthor()?.equals(this.name.getAuthor()))) {
            return false;
        }

        if (!this.checkDerivedField('contents')) {
            return false;
        }

        if (!(this.items instanceof MutableArray)) {
            return false;
        }

        if (this.items.duplicates) {
            return false;
        }

        if (!Types.checkTypeConstraint(this.items?.typeConstraints, [Folder.className, SpaceLink.className])) {
            return false;
        }

        if (!(this.getAuthor()?.equals(this.items?.getAuthor()))) {
            return false;
        }

        return true;

    }

}

ClassRegistry.register(Folder.className, Folder);

export { Folder, FolderItem, FolderEvent, AddToFolderEvent, RemoveFromFolderEvent };