import { ClassRegistry, Event, HashedObject, Hashing, Identity, MeshNode, MutationObserver, PeerGroupInfo, PeerInfo, PeerSource, Resources, SpaceEntryPoint, SyncMode, MutableContentEvents } from '@hyper-hyper-space/core';
import { Conversation } from './Conversation';
import { ConversationSet } from './ConversationSet';


class ChatSpace extends HashedObject implements SpaceEntryPoint {

    static className = 'hhs-home/v0/ChatSpace';

    conversations?: ConversationSet;

    _node?: MeshNode;

    _synchronizing = false;
    _ownSync?:{localPeer: PeerInfo, peerSource: PeerSource};

    _conversationsObserver: MutationObserver = (ev: Event<HashedObject>) => {

        if (ev.emitter === this.conversations) {
            if (ev.action === MutableContentEvents.AddObject) {
                if (this._synchronizing) {
                    const conversation = ev.data as Conversation;
                    conversation.startSync(this._ownSync);    
                }
            } else if (ev.action === MutableContentEvents.RemoveObject) {
                if (this._synchronizing) {
                    const conversation = ev.data as Conversation;
                    conversation.stopSync(this._ownSync);    
                }
            }
        }

    }

    constructor(owner?: Identity) {
        super();

        if (owner !== undefined) {
            this.setAuthor(owner);
            this.conversations = new ConversationSet(owner);
            this.init();
        }
    }

    init(): void {
        this.conversations?.addMutationObserver(this._conversationsObserver);
    }

    getClassName(): string {
        return ChatSpace.className;
    }

    async validate(_references: Map<string, HashedObject>): Promise<boolean> {
        
        if (this.getAuthor() === undefined) {
            return false;
        }

        return this.equals(new ChatSpace(this.getAuthor()));
    }

    // TODO: make startSync and stopSync reentrant, check they are free of races
    
    async startSync(ownSync?:{localPeer: PeerInfo, peerSource: PeerSource}): Promise<void> {

        if (!this._synchronizing) {
            this._node = new MeshNode(this.getResources() as Resources);

            if (ownSync !== undefined) {
                const pg: PeerGroupInfo = {
                    id: Hashing.forString('chat-space-for-' + (this.getAuthor() as Identity).hash()),
                    localPeer: ownSync.localPeer,
                    peerSource: ownSync.peerSource
                };
    
                this._ownSync = ownSync;

                this._node.sync(this.conversations as ConversationSet, SyncMode.single, pg);
            }
    
            const conversations = this.conversations as ConversationSet;

            await conversations.loadAndWatchForChanges();
    
            for (const conversation of conversations.values()) {
                conversation.startSync(ownSync);
            }

            this._synchronizing = true;
        }


    }

    async stopSync(ownSync?:{localPeer: PeerInfo, peerSource: PeerSource}): Promise<void> {
        if (this._synchronizing) {
            if (ownSync !== undefined) {
                const pg: PeerGroupInfo = {
                    id: Hashing.forString('chat-space-for-' + (this.getAuthor() as Identity).hash()),
                    localPeer: ownSync.localPeer,
                    peerSource: ownSync.peerSource
                };
    
                (this._node as MeshNode).stopSync(this.conversations as ConversationSet, pg.id);
            }

            const conversations = this.conversations as ConversationSet;

            conversations.dontWatchForChanges();

            conversations.removeMutationObserver(this._conversationsObserver);

            for (const conversation of conversations.values()) {
                conversation.stopSync(ownSync);
            }

            this._synchronizing = false;
        }
    }

    getConversationFor(remoteId: Identity) {
        const conv = new Conversation(this.getAuthor(), remoteId);

        const existing = this.conversations?.get(conv.hash());

        if (existing !== undefined) {
            return existing;
        } else {
            conv.setResources(this.getResources() as Resources);
            conv.loadAndWatchForChanges();
            return conv;
        }
    }

}

ClassRegistry.register(ChatSpace.className, ChatSpace);

export { ChatSpace };