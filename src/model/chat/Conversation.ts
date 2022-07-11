import { HashedObject, Event, ClassRegistry, Identity, SpaceEntryPoint, PeerInfo, PeerSource, MeshNode, SyncMode, PeerGroupInfo, Hashing, IdentityPeer, ConstantPeerSource, HashedSet, Hash, MutableReference, MutationObserver, MutationOp, MutableSet } from '@hyper-hyper-space/core';
import { Message } from './Message';
import { MessageInbox } from './MessageInbox';

// Convesation: a pair of MessageInboxes used for two-way communications between a local and a remote Identity

class Conversation extends HashedObject implements SpaceEntryPoint {

    static className = 'hhs-home/v0/Conversation';

    outgoing?: MessageInbox;
    incoming?: MessageInbox;

    _synchronizing = false;

    _node?: MeshNode;
    
    _outgoingSync = false;
    _outgoingDisableSyncTimer?: number;

    _incomingSync = false;
    _incomingDisableSyncTimer?: number;

    _peerGroup?: PeerGroupInfo;

    _outgoingDisableSyncCallback = () => {
        
        this._outgoingDisableSyncTimer = undefined;

        if (this.outgoing?.inSync()) {
            this.disableOutgoingSync();
        }
    }

    _incomingDisableSyncCallback = () => {
        this._incomingDisableSyncTimer = undefined;

        if (this.incoming?.inSync()) {
            this.disableIncomingSync();
        }
    }

    _syncMutationObserver: MutationObserver = (ev: Event<HashedObject>) => {

        if (ev.emitter === this.outgoing.messages || ev.emitter === this.outgoing.receivedAck) {

            this.checkOutgoingState();

        }

        if (ev.emitter === this.incoming.messages || ev.emitter === this.incoming.receivedAck) {

            this.checkIncomingState();

        }

    }

    constructor(local?: Identity, remote?: Identity) {
        super();

        if (local !== undefined && remote !== undefined) {
            this.outgoing = new MessageInbox(local, remote);
            this.incoming = new MessageInbox(remote, local);
        }
    }

    getClassName(): string {
        return Conversation.className;
    }

    init(): void {

    }

    async validate(references: Map<string, HashedObject>): Promise<boolean> {

        const local  = this.getLocalIdentity();
        const remote = this.getRemoteIdentity();

        if (!(local instanceof Identity)) {
            return false;
        }

        if (!(remote instanceof Identity)) {
            return false;
        }

        if (local.equals(remote)) {
            return false;
        }

        if (!this.equals(new Conversation(local, remote))) {
            return false;
        }
        
        return true;
    }

    async startSync(ownSync?:{localPeer: PeerInfo, peerSource: PeerSource}): Promise<void> {
        
        if (this._synchronizing) {
            return;
        }

        this._synchronizing = true;

        this._node = new MeshNode(this.getResources());

        await this.outgoing?.loadAndWatchForChanges();
        await this.incoming?.loadAndWatchForChanges();

        

        if (ownSync !== undefined) {
            const pg: PeerGroupInfo = {
                id: Hashing.forString('conversation-' + this.hash() + '-for-' + this.getLocalIdentity().hash()),
                localPeer: ownSync.localPeer,
                peerSource: ownSync.peerSource
            };

            this._node.sync(this.outgoing as MessageInbox, SyncMode.full, pg);
            this._node.sync(this.incoming as MessageInbox, SyncMode.full, pg);
        }

        const participants = (new HashedSet<Hash>([this.getLocalIdentity().hash(), this.getRemoteIdentity().hash()].values()));

        const peerGroupId = Hashing.forString('conversation-between' + participants.hash());

        const localPeer  = await IdentityPeer.fromIdentity(this.getLocalIdentity()).asPeer();
        const remotePeer = await IdentityPeer.fromIdentity(this.getRemoteIdentity()).asPeer();

        const peerSource = new ConstantPeerSource([localPeer, remotePeer].values());

        this._peerGroup = {
            id: peerGroupId,
            localPeer: localPeer,
            peerSource: peerSource
        }

        this._node.sync(this.outgoing?.receivedAck as MutableReference<HashedSet<MutationOp>>, SyncMode.single, this._peerGroup);
        this._node.sync(this.incoming?.messages as MutableSet<Message>, SyncMode.single, this._peerGroup);

        this.addMutationObserver(this._syncMutationObserver);

        this.checkIncomingState();
        this.checkOutgoingState();

    }

    stopSync(ownSync?:{localPeer: PeerInfo, peerSource: PeerSource}): Promise<void> {
        
        if (!this._synchronizing) {
            return;
        }

        this.disableIncomingSync()
        this.disableOutgoingSync();

        this._synchronizing = false;

        clearTimeout(this._incomingDisableSyncTimer);
        clearTimeout(this._outgoingDisableSyncTimer);

        


        this._node.stopSync(this.outgoing?.receivedAck as MutableReference<HashedSet<MutationOp>>, this._peerGroup?.id as string);
        this._node.stopSync(this.incoming?.messages as MutableSet<Message>, SyncMode.single, this._peerGroup?.id as string);

        if (ownSync !== undefined) {
            const pg: PeerGroupInfo = {
                id: Hashing.forString('conversation-' + this.hash() + '-for-' + this.getLocalIdentity().hash()),
                localPeer: ownSync.localPeer,
                peerSource: ownSync.peerSource
            };

            this._node.sync(this.outgoing as MessageInbox, SyncMode.full, pg);
            this._node.sync(this.incoming as MessageInbox, SyncMode.full, pg);
        }
    }

    private checkOutgoingState() {

        if (this._synchronizing) {
            if (this._outgoingDisableSyncTimer !== undefined) {
                clearTimeout(this._outgoingDisableSyncTimer);
            }

            if (!this.outgoing?.inSync()) {
                this.enableOutgoingSync();
                this._outgoingDisableSyncTimer = window.setTimeout(this._outgoingDisableSyncCallback, 60000);
            }
        }
    }

    private checkIncomingState() {

        if (this._synchronizing) {
            if (this._incomingDisableSyncTimer !== undefined) {
                clearTimeout(this._incomingDisableSyncTimer);
            }

            if (!this.incoming?.inSync()) {
                this.enableIncomingSync();
                this._incomingDisableSyncTimer = window.setTimeout(this._incomingDisableSyncCallback, 60000);
            }
        }
    }

    private enableOutgoingSync() {
        if (this._synchronizing && !this._outgoingSync) {
            this._outgoingSync = true;
            this._node.sync(this.outgoing?.messages as MutableSet<Message>, SyncMode.single, this._peerGroup)
        }
    }

    private disableOutgoingSync() {
        if (this._synchronizing && this._outgoingSync) {
            this._outgoingSync = false;
            this._node.stopSync(this.outgoing?.messages as MutableSet<Message>, this._peerGroup?.id as string);
        }
    }

    private enableIncomingSync() {
        if (this._synchronizing && !this._incomingSync) {
            this._incomingSync = true;
            this._node.sync(this.incoming?.receivedAck as MutableReference<HashedSet<MutationOp>>, SyncMode.single, this._peerGroup);
        }
    }

    private disableIncomingSync() {
        if (this._synchronizing && this._incomingSync) {
            this._incomingSync = false;
            this._node.stopSync(this.incoming?.receivedAck as MutableReference<HashedSet<MutationOp>>, this._peerGroup?.id as string);
        }
    }

    getLocalIdentity() {
        return this.outgoing?.messages?.writer as Identity;
    }

    getRemoteIdentity() {
        return this.incoming?.messages?.writer as Identity;
    }

}

ClassRegistry.register(Conversation.className, Conversation);

export { Conversation };