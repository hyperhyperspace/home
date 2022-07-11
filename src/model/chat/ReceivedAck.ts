import { HashedObject, HashedSet, Identity, MutableReference, MutableSet, MutationOp, RefUpdateOp } from '@hyper-hyper-space/core';
import { Message } from './Message';


class ReceivedAck extends MutableReference<HashedSet<MutationOp>> {

    messages?: MutableSet<Message>;

    constructor(messages?: MutableSet<Message>, recipient?: Identity) {
        super({writer: recipient});

        this.messages = messages;
    }

    shouldAcceptMutationOp(op: MutationOp, opReferences: Map<string, HashedObject>) {

        if (!super.shouldAcceptMutationOp(op, opReferences)) {
            return false;
        }

        const updateOp = op as RefUpdateOp<HashedSet<MutationOp>>;
        const val = updateOp.value;

        if (val !== undefined) {
            if(!(val instanceof HashedSet)) {
                return false;
            }

            for (const elmt of val.values()) {
                if (!(elmt instanceof MutationOp)) {
                    return false;
                }

                if (!this.messages.shouldAcceptMutationOp(elmt, opReferences)) {
                    return false;
                }
            }
        }

        return true;
    }

    async validate(references: Map<string, HashedObject>) {

        if (!(await super.validate(references))) {
            return false;
        }

        if (!(this.messages instanceof MutableSet)) {
            return false;
        }

        return this.equals(new ReceivedAck(this.messages, this.writer));
    }

}

export { ReceivedAck };