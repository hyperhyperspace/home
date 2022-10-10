import { ClassRegistry, HashedObject, Identity, MutableReference, RSAPublicKey } from '@hyper-hyper-space/core';

import { LocalDeviceInfo } from './LocalDeviceInfo';

class Device extends HashedObject {

    static className = 'hhs-home/v0/Device';

    name?: MutableReference<string>;
    publicKey?: RSAPublicKey;

    constructor(owner?: Identity, publicKey?: RSAPublicKey, id?: string) {
        super();

        if (owner !== undefined) {
            this.setAuthor(owner);
            if (id === undefined) {
                this.setRandomId();
            } else {
                this.setId(id);
            }
            

            const name = new MutableReference({writer: owner, acceptedTypes: ['string']});
            name.setAuthor(owner);
            this.addDerivedField('name', name);

            if (publicKey === undefined) {
                throw new Error('A device public key is necessary to create a new device.');
             }

            this.publicKey = publicKey;
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

        if (this.getAuthor() === undefined) {
            return false;
        }

        if (!(this.name instanceof MutableReference)) {
            return false;
        }

        if (!this.name.validateAcceptedTypes(['string'])) {
            return false;
        }

        if (!(this.getAuthor()?.equals(this.name.getAuthor()))) {
            return false;
        }

        if (!this.name.hasSingleWriter() || !(this.getAuthor()?.equals(this.name.getSingleWriter()))) {
            return false;
        }

        if (!this.checkDerivedField('name')) {
            return false;
        }
        
        if (!(this.publicKey instanceof RSAPublicKey)) {
            return false;
        }


        return true;
    }

}

ClassRegistry.register(Device.className, Device);

export { Device };