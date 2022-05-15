import { ClassRegistry, HashedObject, Identity, MutableReference, Types } from '@hyper-hyper-space/core';

class SpaceLink extends HashedObject {

    static className = 'hhs-home/v0/SpaceLink';

    spaceEntryPoint?: HashedObject;
    name?: MutableReference<string>;

    constructor(owner?: Identity, spaceEntryPoint?: HashedObject) {
        super();

        if (owner !== undefined) {

            if (!(spaceEntryPoint instanceof HashedObject)) {
                throw new Error('A spaceEntryPoint is necessary to create a SpaceLink instance');
            }

            this.setAuthor(owner);
            this.setRandomId();

            this.spaceEntryPoint = spaceEntryPoint;

            const localName = new MutableReference();
            localName.typeConstraints = ['string'];
            localName.setAuthor(owner);
            this.addDerivedField('name', localName);
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

        if (!(this.spaceEntryPoint instanceof HashedObject)) {
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

        
        return true;
    }

}

ClassRegistry.register(SpaceLink.className, SpaceLink);

export { SpaceLink };