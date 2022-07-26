import { ClassRegistry, Hash, HashedObject, Identity, MutableSet, MutableSetAddOp, MutationOp } from '@hyper-hyper-space/core';
import { Message } from './Message';

class MessageSet extends MutableSet<Message> {

    static className = 'hhs-home/v0/MessageSet';

    constructor(owner?: Identity) {
        super({writer: owner});
    }

    async validate(references: Map<string, HashedObject>): Promise<boolean> {

        if (!(await super.validate(references))) {
            return false;
        }

        if (this.writer === undefined) {
            return false;
        }

        if (this.getId() === undefined) {
            return false;
        }

        const clone = new MessageSet(this.writer);

        clone.setId(this.getId() as string);

        return this.equals(clone);
    }

    shouldAcceptMutationOp(op: MutationOp, opReferences: Map<Hash, HashedObject>) {
        if (!super.shouldAcceptMutationOp(op, opReferences)) {
            return false;
        }

        if (op instanceof MutableSetAddOp) {
            const addition = op.element;

            if (!(addition instanceof Message)) {
                return false;
            }

            if (!this.writer?.equals(addition.getAuthor())) {
                return false;
            }
        }

        return true;
    }

    getClassName() {
        return MessageSet.className;
    }

}

ClassRegistry.register(MessageSet.className, MessageSet);

export { MessageSet };