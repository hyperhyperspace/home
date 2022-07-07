import { ClassRegistry, HashedObject, Identity } from '@hyper-hyper-space/core';
import { MutationOp } from '@hyper-hyper-space/core';
import { MutableReference, RefUpdateOp } from '@hyper-hyper-space/core';

class StringMutableRef extends MutableReference<string> {

    static className = 'hhs/v0/StringMutableRef';

    maxLength?: number;

    constructor(config={maxLength: undefined as (number | undefined), writer: undefined as (Identity | undefined)}) {
        super({writer: config.writer});

        this.maxLength = config.maxLength;
    }

    getClassName(): string {
        return StringMutableRef.className;
    }

    setValue(value: string): Promise<void> {

        if (!this.checkSize(value)) {
            throw new Error('Trying to set the value to a string that is longer than the maximum for this StringMutableRef: ' + this.maxLength + '.');
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

            if (typeof(op.value) !== 'string') {
                return false;
            }

            if (!this.checkSize(op.value)) {
                return false;
            }
        }
        
        return true;
    }

    async validate(references: Map<string, HashedObject>): Promise<boolean> {
        return (this.maxLength === undefined || typeof(this.maxLength) === 'number') && await super.validate(references);
    }

    private checkSize(value: string): boolean {
        return this.maxLength === undefined || value.length <= this.maxLength;
    }
}

ClassRegistry.register(StringMutableRef.className, StringMutableRef);

export { StringMutableRef };