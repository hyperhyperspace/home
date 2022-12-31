import { ClassRegistry, ConstantPeerSource, EmptyPeerSource, HashedObject, Hashing, Identity, IdentityPeer, MeshNode, MutableContentEvents, MutableReference, MutableSet, MutationEvent, MutationObserver, PeerGroupInfo, Resources, SpaceEntryPoint, SyncMode } from '@hyper-hyper-space/core';
import { SpaceLink } from '../folders/SpaceLink';
import { Base64MutableRef } from '../../utils/Base64MutableRef';
import { StringMutableRef } from '../../utils/StringMutableRef';

const pictureMaxSize = 300 * 1024;
const thumbnailMaxSize = 32 * 1024;

const MIMETypeMaxLength = 64;

const aboutMaxLength = 500;

class Profile extends HashedObject implements SpaceEntryPoint {

    static className = 'hhs/v0/Profile';
    static version   = '0.0.6';

    owner?: Identity;

    picture?: Base64MutableRef;
    pictureMIMEType?: StringMutableRef;

    thumbnail?: Base64MutableRef;
    thumbnailMIMEType?: StringMutableRef;

    about?: StringMutableRef;

    published?: MutableSet<SpaceLink>;

    version?: string;

    _peerGroup?: PeerGroupInfo;
    _node?: MeshNode;


    _publishedNamesObs: MutationObserver;

    constructor(owner?: Identity) {
        super();

        if (owner !== undefined) {

            this.owner = owner;

            this.setId(this.getDerivedId());

            this.addDerivedField('picture', new Base64MutableRef({maxLengthInBytes: pictureMaxSize, writer: owner}));
            this.addDerivedField('thumbnail', new Base64MutableRef({maxLengthInBytes: thumbnailMaxSize, writer: owner}));

            this.addDerivedField('pictureMIMEType', new StringMutableRef({maxLength: MIMETypeMaxLength, writer: owner}));
            this.addDerivedField('thumbnailMIMEType', new StringMutableRef({maxLength: MIMETypeMaxLength, writer: owner}));

            this.addDerivedField('about', new StringMutableRef({maxLength: aboutMaxLength, writer: owner}));

            this.addDerivedField('published', new MutableSet({writer: owner, acceptedTypes: [SpaceLink.className]}));

            this.version = Profile.version;
        }

        this._publishedNamesObs = (ev: MutationEvent) => {
            if (ev.emitter === this.published) {

                if (this._node !== undefined) {
                    if (ev.action === MutableContentEvents.AddObject) {
                        console.log('STARTING SYNC OF LINK NAME FROM OBS')
                        const link = ev.data as SpaceLink;
                        this._node?.sync(link.name as MutableReference<string>, SyncMode.single, this._peerGroup);
                    } else if (ev.action === MutableContentEvents.RemoveObject) {
                        const link = ev.data as SpaceLink;
                        this._node?.stopSync(link.name as MutableReference<string>, this._peerGroup?.id);
                    }    
                }
            }
        };
    }

    init(): void {

    }

    syncIsEnabled(): boolean {
        return this._node !== undefined;
    }

    async startSync(config?: {owner?: boolean, requester?: Identity}): Promise<void> {


        if (this._node === undefined) {

            this._node = new MeshNode(this.getResources() as Resources);

            await this.loadAndWatchForChanges();

            const peerGroupId = this.hash();

            const ownerPeer = await IdentityPeer.fromIdentity(this.owner as Identity).asPeer();

            if (config?.owner) {

                // TODO: Create a new broadcast mode where the broadcaster has to prove possesing an identity
                //       that's being used in the broadcast. This would enable a semi-private object discovery,
                //       where only the linkup server and the broadcast can know about the query (since no 3rd
                //       party could broadcast -and receive queries- without authenticating).

                // this._node.authenticatedBroadcast(this.getAuthor() as Identity);

                this._node.broadcast(this.owner as Identity);
                this._node.broadcast(this);

                console.log('broadcasting profile ' + this.hash())

                this._peerGroup = {
                    id: peerGroupId,
                    peerSource: new EmptyPeerSource(IdentityPeer.getEndpointParser()),
                    localPeer: ownerPeer
                }
            } else {

                const localPeer = config?.requester !== undefined? 
                                    await IdentityPeer.fromIdentity(config?.requester).asPeer()
                                :
                                    (this.getResources() as Resources).getPeersForDiscovery()[0];

                this._peerGroup = {
                    id: peerGroupId,
                    peerSource: new ConstantPeerSource([ownerPeer].values()),
                    localPeer: localPeer
                }
            }
            
            
            this._node.sync(this, SyncMode.full, this._peerGroup);

            this.published?.addObserver(this._publishedNamesObs);

            for (const link of this.published?.values() || []) {
                this._node?.sync(link.name as MutableReference<string>, SyncMode.single, this._peerGroup);
            }

        }
    }

    async stopSync(): Promise<void> {

        if (this._node !== undefined && this._peerGroup !== undefined) {
            this.published?.removeObserver(this._publishedNamesObs);

            for (const link of this.published?.values() || []) {
                this._node?.stopSync(link.name as MutableReference<string>, this._peerGroup?.id);
            }

            this.dontWatchForChanges();
            this._node.stopBroadcast(this.owner as Identity);
            this._node.stopBroadcast(this);
            this._node.stopSync(this, this._peerGroup.id);
            this._node = undefined;
            this._peerGroup = undefined;
        }
    }

    getClassName(): string {
        return Profile.className;
    }

    async validate(_references: Map<string, HashedObject>): Promise<boolean> {
        
        if (this.getAuthor() !== undefined) {
            return false;
        }

        if (!(this.owner instanceof Identity)) {
            return false;
        }

        // picture

        if (!(this.picture instanceof Base64MutableRef)) {
            return false;
        }

        if (!this.picture.hasSingleWriter() || !(this.owner?.equals(this.picture.getSingleWriter()))) {
            return false;
        }

        if ((this.picture.hasAuthor())) {
            return false;
        }

        if (this.picture.maxSizeInBytes !== pictureMaxSize) {
            return false;
        }

        if (!this.checkDerivedField('picture')) {
            return false;
        }

        // thumbnail

        if (!(this.thumbnail instanceof Base64MutableRef)) {
            return false;
        }

        if (!this.thumbnail.hasSingleWriter() || !(this.owner?.equals(this.thumbnail.getSingleWriter()))) {
            return false;
        }

        if (this.thumbnail.hasAuthor()) {
            return false;
        }

        if (this.thumbnail.maxSizeInBytes !== thumbnailMaxSize) {
            return false;
        }

        if (!this.checkDerivedField('thumbnail')) {
            return false;
        }

        // pictureMIMEType

        if (!(this.pictureMIMEType instanceof StringMutableRef)) {
            return false;
        }

        if (!this.pictureMIMEType.hasSingleWriter() || !(this.owner?.equals(this.pictureMIMEType.getSingleWriter()))) {
            return false;
        }

        if (this.pictureMIMEType.hasAuthor()) {
            return false;
        }

        if (this.pictureMIMEType.maxLength !== MIMETypeMaxLength) {
            return false;
        }

        if (!this.checkDerivedField('pictureMIMEType')) {
            return false;
        }

        // thumbnailMIMEType

        if (!(this.thumbnailMIMEType instanceof StringMutableRef)) {
            return false;
        }

        if (!this.thumbnailMIMEType.hasSingleWriter() || !(this.owner?.equals(this.thumbnailMIMEType.getSingleWriter()))) {
            return false;
        }

        if (this.thumbnailMIMEType.hasAuthor()) {
            return false;
        }

        if (this.thumbnailMIMEType.maxLength !== MIMETypeMaxLength) {
            return false;
        }

        if (!this.checkDerivedField('thumbnailMIMEType')) {
            return false;
        }

        // about

        if (!(this.about instanceof StringMutableRef)) {
            return false;
        }

        if (!this.about.hasSingleWriter() || !(this.owner?.equals(this.about.getSingleWriter()))) {
            return false;
        }

        if (this.about.hasAuthor()) {
            return false;
        }

        if (this.about.maxLength !== aboutMaxLength) {
            return false;
        }

        if (!this.checkDerivedField('about')) {
            return false;
        }

        // published

        if (!((this.published instanceof MutableSet))) {
            return false;
        }

        if (!this.published.hasSingleWriter() || !(this.owner?.equals(this.published.getSingleWriter()))) {
            return false;
        }

        if (this.published.hasAuthor()) {
            return false;
        }

        if (!this.published.validateAcceptedTypes([SpaceLink.className])) {
            return false;
        }

        if (!this.checkDerivedField('published')) {
            return false;
        }

        if (typeof(this.version) !== 'string') {
            return false;
        }

        return true;
    }

    getPictureDataUrl(): string|undefined {
        if (this.pictureMIMEType?._value !== undefined && this.picture?._value !== undefined) {
            return 'data:' + this.pictureMIMEType?._value + ';base64,' + this.picture?._value;
        } else {
            return undefined;
        }
    }

    getName() {
        return this.getAuthor()?.info?.name as string|undefined;
    }

    getVersion(): string {
        return this.version as string;
    }

    private getDerivedId() {
        return Hashing.forString('profile-for-' + this.owner?.hash());
    }
}

ClassRegistry.register(Profile.className, Profile);

export { Profile };