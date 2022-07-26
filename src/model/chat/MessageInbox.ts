import { Hashing, HashedObject, ClassRegistry, Identity, MutableSet, MutationOp, Hash }  from '@hyper-hyper-space/core';
import { MessageSet } from './MessageSet';
import { Message } from './Message';
import { ReceivedAck } from './ReceivedAck';

/* A one-way message inbox, with a reference that the receiver can use to confirm message reception up to a given state */

class MessageInbox extends HashedObject {
    
    static className = 'hhs-home/v0/MessageInbox';

    messages?: MessageSet;
    receivedAck?: ReceivedAck;

    _ackCallback = (mut: MutationOp) => { 



        if (!this.receivedAck?.has(mut)) {
            this.receivedAck?.add(mut).then(() => {
                this.receivedAck?.save();
                console.log('generated ACK')
            });
            
        }

    };

    constructor(sender?: Identity, recipient?: Identity) {
        super();

        if (sender !== undefined && recipient !== undefined) {

            this.setId(MessageInbox.idFor(sender, recipient));

            this.addDerivedField('messages', new MessageSet(sender));
            const messages = this.messages as MessageSet;

            this.addDerivedField('receivedAck', new ReceivedAck(messages, recipient))
        }
    }

    init(): void {
        
    }

    getClassName(): string {
        return MessageInbox.className;
    }

    


    async validate(_references: Map<string, HashedObject>): Promise<boolean> {

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
        return this.messages?.writer as Identity;
    }

    getReceiver() {
        return this.receivedAck?.writer as Identity;
    }

    inSync() {

        for (const op of this.messages?._terminalOps?.values() as IterableIterator<MutationOp>) {
            if (!this.receivedAck?.has(op)) {
                return false;
            }
        }

        return true;
    }

    enableAckGeneration() {
        this.messages?.addMutationOpCallback(this._ackCallback);
    }

    disableAckGeneration() {
        this.messages?.deleteMutationOpCallback(this._ackCallback);
    }

    async generateMissingAcks(): Promise<void> {

        console.log('about to generate missing acks')

        if (this.receivedAck?.size() === 0) {

            console.log('attempted to laod acks')

            await this.receivedAck?.loadAllChanges();
        }

        if (!this.inSync()) {

            console.log('not in sync, moving forward')

            const messages = await this.getStore().load(this.messages?.hash() as Hash, false, false) as MutableSet<Message>|undefined;

            if (messages !== undefined) {

                console.log('found messages')

                const cb = (mut: MutationOp) => {

                    console.log('CALLBACK!')

                    if (!this.receivedAck?.has(mut)) {
                        this.receivedAck?.add(mut);
                    }
                };

                messages.addMutationOpCallback(cb);

                await messages.loadAllChanges();

                messages.deleteMutationOpCallback(cb);

                await this.receivedAck?.save();
            }


        }

    }

    private static idFor(sender: Identity, recipient: Identity) {
        return Hashing.forString('inbox-from' + sender.getLastHash() + '-to-' + recipient.getLastHash());
    }

}

ClassRegistry.register(MessageInbox.className, MessageInbox);

export { MessageInbox };