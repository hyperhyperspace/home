import { ClassRegistry, ConstantPeerSource, EmptyPeerSource, HashedObject, Hashing, Identity, IdentityPeer, MeshNode, PeerGroupInfo, Resources, SpaceEntryPoint, SyncMode } from '@hyper-hyper-space/core';
import { Base64MutableRef } from '../../utils/Base64MutableRef';
import { StringMutableRef } from '../../utils/StringMutableRef';

const pictureMaxSize = 300 * 1024;
const thumbnailMaxSize = 32 * 1024;

const MIMETypeMaxLength = 64;

const aboutMaxLength = 500;

class Profile extends HashedObject implements SpaceEntryPoint {

    static className = 'hhs/v0/Profile';

    owner?: Identity;

    picture?: Base64MutableRef;
    pictureMIMEType?: StringMutableRef;

    thumbnail?: Base64MutableRef;
    thumbnailMIMEType?: StringMutableRef;

    about?: StringMutableRef;

    _peerGroup?: PeerGroupInfo;
    _node?: MeshNode;

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
            
        }
    }

    syncIsEnabled(): boolean {
        return this._node !== undefined;
    }

    async startSync(config?: {owner?: boolean, requester?: Identity}): Promise<void> {
        await this.loadAndWatchForChanges();

        this._node = new MeshNode(this.getResources() as Resources);

        const peerGroupId = this.hash();

        const ownerPeer = await IdentityPeer.fromIdentity(this.owner as Identity).asPeer();

        if (config?.owner) {

            // TODO: Create a new broadcast mode where the broadcaster has to proof possesing an identity
            //       that's being used in the broadcast. This would enable a semi-private object discovery,
            //       where only the linkup server and the broadcast can know about the query (since no 3rd
            //       party could broadcast -and receive queries- without authenticating).

            // this._node.authorBroadcast(this.getAuthor() as Identity);

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
    }

    async stopSync(): Promise<void> {
        if (this._node !== undefined && this._peerGroup !== undefined) {
            this._node.stopBroadcast(this.owner as Identity);
            this._node.stopBroadcast(this);
            this._node.stopSync(this, this.hash());
        }
    }

    getClassName(): string {
        return Profile.className;
    }

    init(): void {
        
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

        if (!(this.owner?.equals(this.picture.writer))) {
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

        if (!(this.owner?.equals(this.thumbnail.writer))) {
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

        if (!(this.owner?.equals(this.pictureMIMEType.writer))) {
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

        if (!(this.owner?.equals(this.thumbnailMIMEType.writer))) {
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

        if (!(this.owner?.equals(this.about.writer))) {
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

        return true;
    }

    getPictureDataUrl(): string|undefined {
        if (this.pictureMIMEType?._value !== undefined && this.picture?._value !== undefined) {
            return 'data:' + this.pictureMIMEType?._value + ';base64,' + this.picture?._value;
        } else {
            return undefined;
        }
    }

    private getDerivedId() {
        return Hashing.forString('profile-for-' + this.owner?.hash());
    }
}

ClassRegistry.register(Profile.className, Profile);

export { Profile };