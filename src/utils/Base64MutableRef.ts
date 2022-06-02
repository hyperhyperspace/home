import { ClassRegistry, HashedObject } from '@hyper-hyper-space/core';
import { MutationOp } from '@hyper-hyper-space/core';
import { MutableReference, RefUpdateOp } from '@hyper-hyper-space/core';
import { Strings } from '@hyper-hyper-space/core';

class Base64MutableRef extends MutableReference<string> {

    static className = 'hhs/v0/Base64MutableRef';

    maxSizeInBytes?: number;

    constructor(maxLengthInBytes?: number) {
        super();

        this.maxSizeInBytes = maxLengthInBytes;
    }

    getClassName(): string {
        return Base64MutableRef.className;
    }

    shouldAcceptMutationOp(op: MutationOp, opReferences: Map<string, HashedObject>): boolean {
        
        if (!super.shouldAcceptMutationOp(op, opReferences)) {
            return false;
        }

        if (op instanceof RefUpdateOp) {
            if (op.value === undefined) {
                return false;
            }

            const hexVal = Strings.base64toHex(op.value);

            if (this.maxSizeInBytes !== undefined && hexVal.length / 2 > this.maxSizeInBytes) {
                return false;
            }
        }
        
        return true;
    }

    async validate(references: Map<string, HashedObject>): Promise<boolean> {
        return (this.maxSizeInBytes === undefined || typeof(this.maxSizeInBytes) === 'number') && await super.validate(references);
    }
}

ClassRegistry.register(Base64MutableRef.className, Base64MutableRef);

export { Base64MutableRef };