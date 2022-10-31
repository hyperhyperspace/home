import { ClassRegistry, HashedObject, Identity, location, MutableReference, MutationEvent, MutationObserver } from '@hyper-hyper-space/core';


type RenameSpaceLinkEvent = {emitter: SpaceLink, action: 'rename', path?: location<HashedObject>[], data: string};

class SpaceLink extends HashedObject {

    static className = 'hhs-home/v0/SpaceLink';

    spaceEntryPoint?: HashedObject;
    name?: MutableReference<string>;

    _nameObserver: MutationObserver;

    constructor(owner?: Identity, spaceEntryPoint?: HashedObject) {
        super();

        if (owner !== undefined) {

            if (!(spaceEntryPoint instanceof HashedObject)) {
                throw new Error('A spaceEntryPoint is necessary to create a SpaceLink instance');
            }

            this.setAuthor(owner);
            this.setRandomId();

            this.spaceEntryPoint = spaceEntryPoint;

            const localName = new MutableReference({writer: owner, acceptedTypes: ['string']});
            this.addDerivedField('name', localName);
        }

        this._nameObserver = (ev: MutationEvent) => {

            if (ev.emitter === this.name) {
                if (ev.action === 'update') {
                    this._mutationEventSource?.emit({emitter: this, action:'rename', data: ev.data} as RenameSpaceLinkEvent);
                    return true;
                }   
            }

            return false;
        };

    }

    getClassName(): string {
        return SpaceLink.className;
    }

    init(): void {
        this.addObserver(this._nameObserver);
    }

    async validate(references: Map<string, HashedObject>): Promise<boolean> {

        references;

        if (this.getAuthor() === undefined) {
            return false;
        }

        if (!(this.spaceEntryPoint instanceof HashedObject)) {
            return false;
        }

        if (!this.checkDerivedField('name')) {
            return false;
        }

        if (!(this.name instanceof MutableReference)) {
            return false;
        }

        if (!this.name.validateAcceptedTypes(['string'])) {
            return false;
        }

        if (!this.name.hasSingleWriter() || !(this.getAuthor()?.equals(this.name.getSingleWriter()))) {
            return false;
        }

        if (this.name.getAuthor() !== undefined) {
            return false;
        }

        
        return true;
    }

}

ClassRegistry.register(SpaceLink.className, SpaceLink);

export { SpaceLink };