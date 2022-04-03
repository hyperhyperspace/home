import { ClassRegistry, Hash, HashedObject, Identity, MutableReference, Types } from '@hyper-hyper-space/core';

class SpaceLink extends HashedObject {

    static className = 'hhs-home/v0/SpaceLink';

    spaceEntryHash?: Hash;
    localName?: MutableReference<string>;

    constructor(owner?: Identity, spaceEntryHash?: Hash) {
        super();

        if (owner !== undefined) {

            if (spaceEntryHash === undefined) {
                throw new Error('A spaceEntryHash is necessary to create a SpaceLink instance');
            }

            this.setAuthor(owner);
            this.setRandomId();

            this.spaceEntryHash = spaceEntryHash;

            const localName = new MutableReference();
            localName.typeConstraints = ['string'];
            localName.setAuthor(owner);
            this.addDerivedField('localName', localName);
        }

    }

    getClassName(): string {
        return SpaceLink.className;
    }

    init(): void {
        
    }

    async validate(references: Map<string, HashedObject>): Promise<boolean> {

        references;

        if (this.getAuthor() === undefined) {
            return false;
        }

        if (typeof this.spaceEntryHash !== 'string') {
            return false;
        }

        if (!this.checkDerivedField('localName')) {
            return false;
        }

        if (!(this.localName instanceof MutableReference)) {
            return false;
        }

        if (!Types.checkTypeConstraint(this.localName?.typeConstraints, ['string'])) {
            return false;
        }

        if (!(this.getAuthor()?.equals(this.localName.getAuthor()))) {
            return false;
        }

        
        return true;
    }

}

ClassRegistry.register(SpaceLink.className, SpaceLink);

export { SpaceLink };