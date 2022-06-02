import { ClassRegistry, HashedObject, Identity } from '@hyper-hyper-space/core';
import { Base64MutableRef } from '../../utils/Base64MutableRef';
import { StringMutableRef } from '../../utils/StringMutableRef';

const smallPictureMaxSize =  4 * 1024;
const largePictureMaxSize = 50 * 1024;

const bioMaxLength = 500;

class Profile extends HashedObject {

    static className = 'hhs/v0/Profile';

    smallPicture?: Base64MutableRef;
    largePicture?: Base64MutableRef;

    bio?: StringMutableRef;

    constructor(owner?: Identity, id?: string) {
        super();

        if (owner !== undefined) {

            this.setAuthor(owner);

            if (id !== undefined) {
                this.setId(id);
            } else {
                this.setRandomId();
            }

            this.addDerivedField('smallPicture', new Base64MutableRef(smallPictureMaxSize));
            this.addDerivedField('largePicture', new Base64MutableRef(largePictureMaxSize));

            (this.smallPicture as Base64MutableRef).setAuthor(owner);
            (this.largePicture as Base64MutableRef).setAuthor(owner);

            this.addDerivedField('bio', new StringMutableRef(bioMaxLength));
            (this.bio as StringMutableRef).setAuthor(owner);
            
        }
    }

    getClassName(): string {
        return Profile.className;
    }

    init(): void {
        
    }

    async validate(_references: Map<string, HashedObject>): Promise<boolean> {
        
        if (this.getAuthor() === undefined) {
            return false;
        }

        if (!(this.smallPicture instanceof Base64MutableRef)) {
            return false;
        }

        if (!(this.getAuthor()?.equals(this.smallPicture.getAuthor()))) {
            return false;
        }

        if (this.smallPicture.maxSizeInBytes !== smallPictureMaxSize) {
            return false;
        }

        if (!this.checkDerivedField('smallPicture')) {
            return false;
        }

        if (!(this.largePicture instanceof Base64MutableRef)) {
            return false;
        }

        if (!(this.getAuthor()?.equals(this.largePicture.getAuthor()))) {
            return false;
        }

        if (this.largePicture.maxSizeInBytes !== largePictureMaxSize) {
            return false;
        }

        if (!this.checkDerivedField('largePicture')) {
            return false;
        }

        if (!(this.bio instanceof StringMutableRef)) {
            return false;
        }

        if (!(this.getAuthor()?.equals(this.bio.getAuthor()))) {
            return false;
        }

        if (this.bio.maxLength !== bioMaxLength) {
            return false;
        }

        if (!this.checkDerivedField('bio')) {
            return false;
        }

        return true;
    }
}

ClassRegistry.register(Profile.className, Profile);

export { Profile };