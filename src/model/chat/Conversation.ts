import { HashedObject, Event, ClassRegistry, Identity, SpaceEntryPoint, PeerInfo, PeerSource, MeshNode, SyncMode, PeerGroupInfo, Hashing, IdentityPeer, ConstantPeerSource, MutationObserver, MutationOp, MutableSet, Resources, MutableContentEvents, Logger, LogLevel, Hash, MutableSetAddOp } from '@hyper-hyper-space/core';
import { Message } from './Message';
import { MessageInbox } from './MessageInbox';

// Convesation: a pair of MessageInboxes used for two-way communications between a local and a remote Identity

class Conversation extends HashedObject implements SpaceEntryPoint {

    static className = 'hhs-home/v0/Conversation';

    static log = new Logger(Conversation.className, LogLevel.TRACE);

    outgoing?: MessageInbox;
    incoming?: MessageInbox;

    _synchronizing = false;

    _node?: MeshNode;
    
    _outgoingSync = false;
    _outgoingDisableSyncTimer?: number;

    _incomingSync = false;
    _incomingDisableSyncTimer?: number;

    _passivePeerGroup?: PeerGroupInfo;
    _activePeerGroup?: PeerGroupInfo;

    _unconfirmedMessages: Set<Hash>;
    _earlyAcks          : Set<Hash>;

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


        if (ev.emitter === this.outgoing?.messages || ev.emitter === this.outgoing?.receivedAck) {

            this.checkOutgoingState();

        }

        if (ev.emitter === this.incoming?.messages || ev.emitter === this.incoming?.receivedAck) {

            this.checkIncomingState();

        }

    }

    _sortedMessages: Array<Message>;

    _acksObserver = (ev: Event<HashedObject>) => {

        if (ev.emitter === this.outgoing?.receivedAck) {
            if (ev.action === MutableContentEvents.AddObject) {

                console.log('ACK received')

                const addOp = ev.data as MutableSetAddOp<Message>;
                const m = addOp.element as Message;
                const h = m.getLastHash();

                if (this._unconfirmedMessages.has(h)) {
                    this._unconfirmedMessages.delete(h);
                } else {
                    this._earlyAcks.add(h);
                }
            }
        }

    };

    _messagesObserver = (ev: Event<HashedObject>) => {

        const sorted = this._sortedMessages as Array<Message>;

        if (ev.emitter === this.outgoing?.messages) {
            if (ev.action === MutableContentEvents.AddObject) {

                console.log('MSG sent')

                const m = ev.data;
                const h = m.getLastHash();

                if (this._earlyAcks.has(h)) {
                    this._earlyAcks.delete(h);
                } else {
                    this._unconfirmedMessages.add(h);
                }

            } else if (ev.action === MutableContentEvents.RemoveObject) {

            }
        }

        if (ev.emitter === this.outgoing?.messages || ev.emitter === this.incoming?.messages) {
            const message = ev.data as Message;
            const timestamp = message.timestamp as number;
            if (ev.action === MutableContentEvents.AddObject) {
                if (sorted.length > 0 && (sorted[sorted.length-1].timestamp as number) < timestamp) {
                    sorted.push(message);
                } else {
                    let idx = sorted.length-1;

                    while (idx >= 0 && ((sorted[idx].timestamp || 0) > timestamp || 
                                       ((sorted[idx].timestamp || 0) === timestamp) &&
                                         sorted[idx].getLastHash().localeCompare(message.getLastHash()) > 0)) {
                            
                            idx = idx - 1;
                    }

                    sorted.splice(idx+1, 0, message);
                }
            } else if (ev.action === MutableContentEvents.RemoveObject) {
                let foundIdx: (number|undefined) = undefined;
                let idx = 0;
                
                for (const candidate of sorted.values()) {
                    if (candidate.equals(message)) {
                        foundIdx = idx;
                        break;
                    } else {
                        idx = idx + 1;
                    }
                }

                if (foundIdx !== undefined) {
                    sorted.splice(foundIdx, 1);
                }
            }
        }
    }

    constructor(local?: Identity, remote?: Identity) {
        super();

        if (local !== undefined && remote !== undefined) {
            this.outgoing = new MessageInbox(local, remote);
            this.incoming = new MessageInbox(remote, local);

            this.init();
        }

        this._sortedMessages = [];
        this._unconfirmedMessages = new Set();
        this._earlyAcks           = new Set();
    }

    getClassName(): string {
        return Conversation.className;
    }

    init(): void {
        this.incoming?.messages?.addMutationObserver(this._messagesObserver);
        this.outgoing?.messages?.addMutationObserver(this._messagesObserver);

        this.outgoing?.receivedAck?.addMutationObserver(this._acksObserver);
    }

    async validate(_references: Map<string, HashedObject>): Promise<boolean> {

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

        Conversation.log.debug('starting sync for conversation ' + this.getLastHash());

        this._synchronizing = true;

        this._node = new MeshNode(this.getResources() as Resources);

        const loadOutgoing = this.outgoing?.loadAndWatchForChanges();
        const loadIncoming =  this.incoming?.loadAndWatchForChanges();

        await Promise.all([loadOutgoing, loadIncoming]);

        this.incoming?.enableAckGeneration();
        await this.incoming?.generateMissingAcks();

        if (ownSync !== undefined) {
            const pg: PeerGroupInfo = {
                id: Hashing.forString('conversation-' + this.hash() + '-for-' + this.getLocalIdentity().hash()),
                localPeer: ownSync.localPeer,
                peerSource: ownSync.peerSource
            };

            this._node.sync(this.outgoing as MessageInbox, SyncMode.full, pg);
            this._node.sync(this.incoming as MessageInbox, SyncMode.full, pg);
        }

        const localIdHash = this.getLocalIdentity().hash();
        const remoteIdHash = this.getRemoteIdentity().hash();

        const activePeerGroupId = Hashing.forString('conversation-flow-' + remoteIdHash + '-to-' + localIdHash);
        Conversation.log.trace('conv ' + this.getLastHash() + ' active peer group id: ' + activePeerGroupId);

        const passivePeerGroupId = Hashing.forString('conversation-flow-' + localIdHash + '-to-' + remoteIdHash);
        Conversation.log.trace('conv ' + this.getLastHash() + ' passive peer group id: ' + passivePeerGroupId);

        const localPeer  = await IdentityPeer.fromIdentity(this.getLocalIdentity()).asPeer();
        const remotePeer = await IdentityPeer.fromIdentity(this.getRemoteIdentity()).asPeer();

        const peerSource = new ConstantPeerSource([localPeer, remotePeer].values());

        this._activePeerGroup = {
            id: activePeerGroupId,
            localPeer: localPeer,
            peerSource: peerSource
        };

        this._passivePeerGroup = {
            id: passivePeerGroupId,
            localPeer: localPeer,
            peerSource: peerSource
        };

        this._node.sync(this.outgoing?.receivedAck as MutableSet<MutationOp>, SyncMode.single, this._passivePeerGroup);
        this._node.sync(this.incoming?.messages as MutableSet<Message>, SyncMode.single, this._passivePeerGroup);

        this.enableIncomingSync();
        this.enableOutgoingSync();

        this.addMutationObserver(this._syncMutationObserver);

        this.checkIncomingState();
        this.checkOutgoingState();

    }

    async stopSync(ownSync?:{localPeer: PeerInfo, peerSource: PeerSource}): Promise<void> {
        
        if (!this._synchronizing) {
            return;
        }

        this.disableIncomingSync()
        this.disableOutgoingSync();

        this._synchronizing = false;

        clearTimeout(this._incomingDisableSyncTimer);
        clearTimeout(this._outgoingDisableSyncTimer);

        
        const node = this._node as MeshNode;

        node.stopSync(this.outgoing?.receivedAck as MutableSet<MutationOp>, this._passivePeerGroup?.id as string);
        node.stopSync(this.incoming?.messages as MutableSet<Message>, this._passivePeerGroup?.id as string);

        if (ownSync !== undefined) {
            const pg: PeerGroupInfo = {
                id: Hashing.forString('conversation-' + this.hash() + '-for-' + this.getLocalIdentity().hash()),
                localPeer: ownSync.localPeer,
                peerSource: ownSync.peerSource
            };

            node.stopSync(this.outgoing as MessageInbox, pg.id);
            node.stopSync(this.incoming as MessageInbox, pg.id);
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
            Conversation.log.debug('Enabling outgoing sync for ' + this.getLastHash());
            this._outgoingSync = true;
            (this._node as MeshNode).sync(this.outgoing?.messages as MutableSet<Message>, SyncMode.single, this._activePeerGroup)
        }
    }

    private disableOutgoingSync() {
        if (this._synchronizing && this._outgoingSync) {
            this._outgoingSync = false;
            Conversation.log.debug('Disabling outgoing sync for ' + this.getLastHash());
            (this._node as MeshNode).stopSync(this.outgoing?.messages as MutableSet<Message>, this._activePeerGroup?.id as string);
        }
    }

    private enableIncomingSync() {
        if (this._synchronizing && !this._incomingSync) {
            this._incomingSync = true;
            Conversation.log.debug('Enabling incoming sync for ' + this.getLastHash());
            (this._node as MeshNode).sync(this.incoming?.receivedAck as MutableSet<MutationOp>, SyncMode.single, this._activePeerGroup);
        }
    }

    private disableIncomingSync() {
        if (this._synchronizing && this._incomingSync) {
            this._incomingSync = false;
            Conversation.log.debug('Disabling incoming sync for ' + this.getLastHash());
            (this._node as MeshNode).stopSync(this.incoming?.receivedAck as MutableSet<MutationOp>, this._activePeerGroup?.id as string);
        }
    }

    getLocalIdentity() {
        return this.outgoing?.messages?.writer as Identity;
    }

    getRemoteIdentity() {
        return this.incoming?.messages?.writer as Identity;
    }

    getSortedMessages(): Array<Message> {
        return this._sortedMessages;
    }

    async post(content: string) {
        const m = new Message();

        m.setAuthor(this.getLocalIdentity());
        m.content = content;
        m.timestamp = Date.now();

        await this.outgoing?.messages?.add(m);
        await this.outgoing?.messages?.save();
    }
}

ClassRegistry.register(Conversation.className, Conversation);

export { Conversation };