import { HashedObject, ClassRegistry, MutableReference, HashedLiteral, Identity, Types } from '@hyper-hyper-space/core';

class LocalDeviceInfo extends HashedObject {

    static className = 'hhs-home/v0/LocalDeviceInfo'

    content?: MutableReference<HashedLiteral>;

    constructor(deviceHash?: string, owner?: Identity) {
        super();

        if (deviceHash !== undefined) {

            if (owner === undefined) {
                throw new Error('LocalDeviceInfo must have an owner');
            }

            this.setId('local-device-info-for-' + deviceHash);

            this.setAuthor(owner);

            const content = new MutableReference();
            content.typeConstraints = [HashedLiteral.className];
            content.setAuthor(owner);
            this.addDerivedField('content', content);
        }

    }

    getClassName(): string {
        return LocalDeviceInfo.className;
    }

    init(): void {
        
    }

    async validate(references: Map<string, HashedObject>): Promise<boolean> {
        references;

        if (this.getAuthor() === undefined) {
            return false;
        }

        if (!this.checkDerivedField('content')) {
            return false;
        }

        if (!(this.content instanceof MutableReference)) {
            return false;
        }

        if (!Types.checkTypeConstraint(this.content?.typeConstraints, [HashedLiteral.className])) {
            return false;
        }

        if (!(this.getAuthor()?.equals(this.content?.getAuthor()))) {
            return false;
        }

        return true;
    }
}

ClassRegistry.register(LocalDeviceInfo.className, LocalDeviceInfo);

export { LocalDeviceInfo };