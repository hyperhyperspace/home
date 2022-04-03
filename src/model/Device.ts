import { ClassRegistry, HashedObject, Identity, MutableReference, RSAKeyPair, RSAPublicKey } from '@hyper-hyper-space/core';

import { LocalDeviceInfo } from './LocalDeviceInfo';

class Device extends HashedObject {

    static className = 'hhs-home/v0/Device';

    name?: MutableReference<string>;
    publicKey?: RSAPublicKey;

    constructor(owner?: Identity, keypair?: RSAKeyPair) {
        super();

        if (owner !== undefined) {
            this.setAuthor(owner);
            this.setRandomId();

            const name = new MutableReference();
            name.typeConstraints = ['string'];
            name.setAuthor(owner);
            this.addDerivedField('name', name);

            if (keypair === undefined) {
                throw new Error('A device kepair is necessary to create a new device.');
             }

            this.publicKey = keypair.makePublicKey();
        }
    }
    
    getLocalDeviceInfo(): LocalDeviceInfo {
        return new LocalDeviceInfo('local-info-for-' + this.hash(), this.getAuthor());
    }

    getClassName(): string {
        return Device.className;
    }

    init(): void {
        
    }

    async validate(references: Map<string, HashedObject>): Promise<boolean> {
        references;

        return true;
    }

}

ClassRegistry.register(Device.className, Device);

export { Device };