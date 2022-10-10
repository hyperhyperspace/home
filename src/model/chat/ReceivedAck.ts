import { ClassRegistry, GrowOnlySet, HashedObject, HashedSet, HashReference, Identity, MutableSet, MutableSetAddOp, MutationOp } from '@hyper-hyper-space/core';
import { Message } from './Message';
import { MessageSet } from './MessageSet';


class ReceivedAck extends GrowOnlySet<MutationOp> {

    static className = 'hhs-home/v0/ReceivedAck'

    messages?: HashReference<MutableSet<Message>>;

    constructor(messages?: MutableSet<Message>, recipient?: Identity) {
        super({writers: ((recipient === undefined? [] : [recipient]).values())});

        this.messages = messages?.createReference();
    }

    shouldAcceptMutationOp(op: MutationOp, opReferences: Map<string, HashedObject>) {

        if (!super.shouldAcceptMutationOp(op, opReferences)) {
            return false;
        }

        if (op instanceof MutableSetAddOp) {

            const innerOp = op.element;

            if (!(innerOp instanceof MutationOp)) {
                return false;
            }

            if (!(innerOp.targetObject?.getLastHash() === this.messages?.hash)) {
                return false;
            }

        }

        return true;
    }

    async validate(references: Map<string, HashedObject>): Promise<boolean> {

        if (!(await super.validate(references))) {
            return false;
        }

        if (!(this.messages instanceof HashReference)) {
            return false;
        }

        const messages = references.get(this.messages.hash);

        if (!(messages instanceof MessageSet)) {
            return false;
        }

        if (this.writers?.size() !== 1) {
            return false;
        }

        const writer = (this.writers as HashedSet<Identity>).values().next().value;

        if (!(writer instanceof Identity)) {
            return false;
        }

        const clone = new ReceivedAck(messages, writer);

        clone.setId(this.getId() as string);

        return this.equals(clone);
    }

    getRecipient() {
        return (this.writers as HashedSet<Identity>).values().next().value as Identity;
    }

    getClassName() {
        return ReceivedAck.className;
    }

}

ClassRegistry.register(ReceivedAck.className, ReceivedAck);

export { ReceivedAck };