import { ClassRegistry, Event, HashedObject, Hashing, Identity, MeshNode, MutationEvents, MutationObserver, PeerGroupInfo, PeerInfo, PeerSource, SpaceEntryPoint, SyncMode } from '@hyper-hyper-space/core';
import { MutableContentEvents } from '@hyper-hyper-space/core/dist/data/model/mutable/MutableObject';
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
                    conversation.stopSync();    
                }
            }
        }

    }

    constructor(owner?: Identity) {
        super();

        if (owner !== undefined) {
            this.setAuthor(owner);
            this.conversations = new ConversationSet(owner);
        }
    }

    init(): void {
        
    }

    getClassName(): string {
        return ChatSpace.className;
    }

    async validate(references: Map<string, HashedObject>): Promise<boolean> {
        
        if (this.getAuthor() === undefined) {
            return false;
        }

        return this.equals(new ChatSpace(this.getAuthor()));
    }

    // TODO: make startSync and stopSync reentrant, check there are no races between them

    async startSync(ownSync?:{localPeer: PeerInfo, peerSource: PeerSource}): Promise<void> {

        if (!this._synchronizing) {
            this._node = new MeshNode(this.getResources());

            if (ownSync !== undefined) {
                const pg: PeerGroupInfo = {
                    id: Hashing.forString('chat-space-for-' + this.getAuthor().hash()),
                    localPeer: ownSync.localPeer,
                    peerSource: ownSync.peerSource
                };
    
                this._node.sync(this.conversations as ConversationSet, SyncMode.single, pg);
            }
    
            await this.conversations.loadAndWatchForChanges();
    
            this.conversations.addMutationObserver(this._conversationsObserver);
    
            for (const conversation of this.conversations.values()) {
                conversation.startSync(ownSync);
            }

            this._synchronizing = true;
        }


    }

    async stopSync(ownSync?:{localPeer: PeerInfo, peerSource: PeerSource}): Promise<void> {
        if (this._synchronizing) {
            if (ownSync !== undefined) {
                const pg: PeerGroupInfo = {
                    id: Hashing.forString('chat-space-for-' + this.getAuthor().hash()),
                    localPeer: ownSync.localPeer,
                    peerSource: ownSync.peerSource
                };
    
                this._node.stopSync(this.conversations as ConversationSet, pg.id);
            }

            this.conversations.dontWatchForChanges();

            this.conversations.removeMutationObserver(this._conversationsObserver);

            for (const conversation of this.conversations.values()) {
                conversation.stopSync(ownSync);
            }

            this._synchronizing = false;
        }
    }

}

ClassRegistry.register(ChatSpace.name, ChatSpace);

export { ChatSpace };