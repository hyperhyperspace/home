import { ClassRegistry, Hash, HashedObject, Identity, MutableReference, MutableSet, RSAPublicKey } from '@hyper-hyper-space/core';

import { Profile } from './Profile';

type IdentityExport = {pk: string, i: any, h: Hash};

class Contacts extends HashedObject {

    static className = 'hhs/v0/Contacts';

    profileIsPublic?: MutableReference<boolean>;
    current?: MutableSet<Profile>;

    constructor(owner?: Identity, id?: string) {
        super();

        if (owner !== undefined) {

            this.setAuthor(owner);

            if (id !== undefined) {
                this.setId(id);
            } else {
                this.setRandomId();
            }

            this.addDerivedField('profileIsPublic', new MutableReference({writer: owner, acceptedTypes: ['boolean']}));
            this.addDerivedField('current', new MutableSet({writer: owner, acceptedTypes: [Profile.className]}));
        }
    }

    getClassName(): string {
        return Contacts.className;
    }

    init(): void {

    }

    async validate(_references: Map<string, HashedObject>): Promise<boolean> {
        
        if (this.getAuthor() === undefined) {
            return false;
        }

        // profileIsPublic

        if (!(this.profileIsPublic instanceof MutableReference)) {
            return false;
        }

        if (this.profileIsPublic.getAuthor() !== undefined) {
            return false;
        }

        if (!this.profileIsPublic.hasSingleWriter() || !(this.getAuthor()?.equals(this.profileIsPublic.getSingleWriter()))) {
            return false;
        }

        if (!this.profileIsPublic.validateAcceptedTypes(['boolean'])){
            return false;
        }

        if (!this.checkDerivedField('profileIsPublic')) {
            return false;
        }

        // current

        if (!(this.current instanceof MutableSet)) {
            return false;
        }

        if (this.current.getAuthor() !== undefined) {
            return false;
        }

        if (!(this.getAuthor()?.equals(this.current.getSingleWriter()))) {
            return false;
        }

        if (!this.current.validateAcceptedTypes([Profile.className])){
            return false;
        }
        
        if (!this.checkDerivedField('current')) {
            return false;
        }

        return true;
    }

    static exportIdentity(id: Identity): IdentityExport {

        return { pk: id.getPublicKey().publicKey as string, i: id.info, h: id.hash() };
    }

    static async importIdentity(exp: IdentityExport): Promise<Identity> {
        //const kp = await RSAKeyPair.fromKeys(exp.pk);
        //const id = Identity.fromKeyPair(exp.i, kp);

        const pk = RSAPublicKey.fromKeys(exp.pk);
        const id = Identity.fromPublicKey(exp.i, pk);

        if (id.hash() !== exp.h) {
            throw new Error('Attempted to process an invalid profile export: hashing mismatch');
        }

        return id;
    }
}

ClassRegistry.register(Contacts.className, Contacts);

export { Contacts }