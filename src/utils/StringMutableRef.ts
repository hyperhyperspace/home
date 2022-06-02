import { ClassRegistry, HashedObject } from '@hyper-hyper-space/core';
import { MutationOp } from '@hyper-hyper-space/core';
import { MutableReference, RefUpdateOp } from '@hyper-hyper-space/core';

class StringMutableRef extends MutableReference<string> {

    static className = 'hhs/v0/StringMutableRef';

    maxLength?: number;

    constructor(maxLength?: number) {
        super();

        this.maxLength = maxLength;
    }

    getClassName(): string {
        return StringMutableRef.className;
    }

    shouldAcceptMutationOp(op: MutationOp, opReferences: Map<string, HashedObject>): boolean {
        
        if (!super.shouldAcceptMutationOp(op, opReferences)) {
            return false;
        }

        if (op instanceof RefUpdateOp) {
            if (op.value === undefined) {
                return false;
            }

            if (typeof(op.value) !== 'string') {
                return false;
            }

            if (this.maxLength !== undefined && op.value.length > this.maxLength) {
                return false;
            }
        }
        
        return true;
    }

    async validate(references: Map<string, HashedObject>): Promise<boolean> {
        return (this.maxLength === undefined || typeof(this.maxLength) === 'number') && await super.validate(references);
    }
}

ClassRegistry.register(StringMutableRef.className, StringMutableRef);

export { StringMutableRef };