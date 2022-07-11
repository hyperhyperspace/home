import { Hash, Hashing, HashedObject, HashedSet, ClassRegistry, Identity, MutableReference, MutableSet, MutationOp }  from '@hyper-hyper-space/core';
import { Message } from './Message';
import { ReceivedAck } from './ReceivedAck';

/* A one-way message inbox, with a reference that the receiver can use to confirm message reception up to a given state */

class MessageInbox extends HashedObject {
    
    static className = 'hhs-home/v0/MessageInbox';

    messages?: MutableSet<Message>;
    receivedAck?: ReceivedAck;


    constructor(sender?: Identity, recipient?: Identity) {
        super();

        if (sender !== undefined && recipient !== undefined) {
            this.setAuthor(sender);

            this.setId(MessageInbox.idFor(sender, recipient));

            this.addDerivedField('messages', new MutableSet<Message>({writer: sender}));
            const messages = this.messages as MutableSet<Message>;
            messages.typeConstraints = [Message.className];

            this.addDerivedField('receivedAck', new ReceivedAck(messages, recipient))
        }
    }

    getClassName(): string {
        return MessageInbox.className;
    }

    init(): void {
        
    }


    async validate(references: Map<string, HashedObject>): Promise<boolean> {

        let sender   = this.getSender();
        let receiver = this.getReceiver();

        if (!(sender instanceof Identity)) {
            return false;
        }

        if (!(receiver instanceof Identity)) {
            return false;
        }

        if (sender.equals(receiver)) {
            return false;
        }

        if (!this.equals(new MessageInbox(this.getSender(), this.getReceiver()))) {
            return false;
        }

        return true;
    }

    getSender() {
        return this.messages.writer as Identity;
    }

    getReceiver() {
        return this.receivedAck.writer as Identity;
    }

    inSync() {
        const ack = this.receivedAck?.getValue();

        let receviedTerminalOpHashes = new Array<Hash>();

        if (ack !== undefined) {
            receviedTerminalOpHashes = Array.from(ack.values()).map((op: MutationOp) => op.hash())
        }

        const receviedTerminalOps = new HashedSet<Hash>(receviedTerminalOpHashes.values())

        return new HashedSet<Hash>(this.messages._terminalOps.keys()).equals(receviedTerminalOps);
    }

    private static idFor(sender: Identity, recipient: Identity) {
        return Hashing.forString('inbox-from' + sender.getLastHash() + '-to-' + recipient.getLastHash());
    }

}

ClassRegistry.register(MessageInbox.className, MessageInbox);

export { MessageInbox };