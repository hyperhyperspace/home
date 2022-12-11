import { ClassRegistry, Event, HashedObject, Hashing, Identity, MeshNode, MutationObserver, PeerGroupInfo, PeerInfo, PeerSource, Resources, SpaceEntryPoint, SyncMode, MutableContentEvents, Endpoint } from '@hyper-hyper-space/core';
import { Conversation } from './Conversation';
import { ConversationSet } from './ConversationSet';


class ChatSpace extends HashedObject implements SpaceEntryPoint {

    static className = 'hhs-home/v0/ChatSpace';
    static version   = '0.0.5';

    conversations?: ConversationSet;

    version?: string;

    _node?: MeshNode;

    _synchronizing = false;
    _ownSync?:{localPeer: PeerInfo, peerSource: PeerSource};

    _conversationsObserver: MutationObserver = (ev: Event<HashedObject>) => {

        if (ev.emitter === this.conversations) {
            if (ev.action === MutableContentEvents.AddObject) {
                if (this._synchronizing) {
                    const conversation = ev.data as Conversation;
                    console.log('starting sync of conversation with ' + conversation.getRemoteIdentity().info?.name);
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
            this.version = ChatSpace.version;
            this.init();
        }
    }

    init(): void {
        this.conversations?.addObserver(this._conversationsObserver);
    }

    getClassName(): string {
        return ChatSpace.className;
    }

    async validate(_references: Map<string, HashedObject>): Promise<boolean> {
        
        if (this.getAuthor() === undefined) {
            return false;
        }

        if (typeof(this.version) !== 'string') {
            return false;
        }

        return this.equals(new ChatSpace(this.getAuthor()));
    }

    // TODO: make startSync and stopSync reentrant, check they are free of races
    
    async startSync(ownSync?:{localPeer: PeerInfo, peerSource: PeerSource}): Promise<void> {

        if (!this._synchronizing) {
            this._node = new MeshNode(this.getResources() as Resources);
    
            const conversations = this.conversations as ConversationSet;

            await conversations.loadAndWatchForChanges();

            if (ownSync !== undefined) {
                const pg: PeerGroupInfo = {
                    id: Hashing.forString('chat-space-for-' + (this.getAuthor() as Identity).hash()),
                    localPeer: ownSync.localPeer,
                    peerSource: ownSync.peerSource
                };
    
                this._ownSync = ownSync;

                this._node.sync(this.conversations as ConversationSet, SyncMode.single, pg);
            }

            for (const conversation of conversations.values()) {
                console.log('starting sync of conversation with ' + conversation.getRemoteIdentity().info?.name);
                conversation.startSync(ownSync);    
            }

            console.log('listening for spawn requests for ' + this.getAuthor()?.hash());

            this._node?.addObjectSpawnCallback(async (object: HashedObject, sender: Identity, _senderEndpoint: Endpoint) => {

                console.log('RECEIVED SPAWN')

                if (object instanceof Conversation) {

                    const conv = object as Conversation;

                    if (conv.getLocalIdentity().equals(this.getAuthor()) && conv.getRemoteIdentity().equals(sender)) {
                        if (!conversations.has(conv)) {
                            await this.getResources()?.store.save(conv);
                            await this.conversations?.add(conv);
                            await this.conversations?.save();    
                        }
                        console.log('CONVESATION SPAWNED');
                    }

                }
            }, this.getAuthor() as Identity);

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

            conversations.removeObserver(this._conversationsObserver);

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

    getName() {
        return undefined;
    }

    getVersion(): string {
        return this.version as string;
    }
}

ClassRegistry.register(ChatSpace.className, ChatSpace);

export { ChatSpace };