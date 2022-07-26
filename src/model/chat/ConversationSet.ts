import { ClassRegistry, Hash, HashedObject, Hashing, Identity, MutableSet, MutableSetAddOp, MutationOp } from '@hyper-hyper-space/core';
import { Conversation } from './Conversation';

// A ConversationSet is a set that only accepts conversations where the localIdentity === its owner

class ConversationSet extends MutableSet<Conversation> {

    static className = 'hhs-home/v0/ConversationSet';

    constructor(owner?: Identity) {
        super({writer: owner});

        if (owner !== undefined) {
            this.setId(Hashing.forString('conversation-set-for-' + owner.hash()));
        }
    }

    async validate(references: Map<string, HashedObject>): Promise<boolean> {

        if (!(await super.validate(references))) {
            return false;
        }

        if (this.writer === undefined) {
            return false;
        }

        return this.equals(new ConversationSet(this.writer));
    }

    shouldAcceptMutationOp(op: MutationOp, opReferences: Map<Hash, HashedObject>) {
        if (!super.shouldAcceptMutationOp(op, opReferences)) {
            return false;
        }

        if (op instanceof MutableSetAddOp) {
            const addition = op.element;

            if (!(addition instanceof Conversation)) {
                return false;
            }

            if (!addition.getLocalIdentity().equals(this.writer)) {
                return false;
            }
        }

        return true;
    }

    getClassName() {
        return ConversationSet.className;
    }    

}

ClassRegistry.register(ConversationSet.className, ConversationSet);

export { ConversationSet };