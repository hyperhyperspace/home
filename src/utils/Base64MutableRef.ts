import { ClassRegistry, HashedObject, Identity } from '@hyper-hyper-space/core';
import { MutationOp } from '@hyper-hyper-space/core';
import { MutableReference, RefUpdateOp } from '@hyper-hyper-space/core';
import { Strings } from '@hyper-hyper-space/core';

class Base64MutableRef extends MutableReference<string> {

    static className = 'hhs/v0/Base64MutableRef';

    maxSizeInBytes?: number;

    constructor(config={maxLengthInBytes: undefined as (number | undefined), writer: undefined as (Identity | undefined)}) {
        super({writer: config.writer});

        this.maxSizeInBytes = config.maxLengthInBytes;
    }

    getClassName(): string {
        return Base64MutableRef.className;
    }

    setValue(value: string): Promise<void> {

        const hexVal = Strings.base64toHex(value);

        if (!this.checkSize(hexVal)) {
            throw new Error('Trying to set a value that is larger than the maximum for this Base64MutableRef: ' + this.maxSizeInBytes + ' bytes.');
        }

        return super.setValue(value);
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

            if (!this.checkSize(hexVal)) {
                return false;
            }
        }
        
        return true;
    }

    async validate(references: Map<string, HashedObject>): Promise<boolean> {
        return (this.maxSizeInBytes === undefined || typeof(this.maxSizeInBytes) === 'number') && await super.validate(references);
    }

    private checkSize(hexVal: string): boolean {
        return this.maxSizeInBytes === undefined || (hexVal.length / 2 + hexVal.length % 2) <= this.maxSizeInBytes;
    }
}

ClassRegistry.register(Base64MutableRef.className, Base64MutableRef);

export { Base64MutableRef };