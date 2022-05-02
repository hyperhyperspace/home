
import { ChaCha20Impl, ClassRegistry, HashedLiteral, HashedObject, Hashing, HMACImpl, Identity, KeyGenImpl, MutableReference, ObjectDiscoveryPeerSource, PeerGroupInfo, PeerNode, RMDImpl, RNGImpl, RSAKeyPair, RSAPublicKey, SecretBasedPeerSource, SpaceEntryPoint, Strings, SyncMode } from '@hyper-hyper-space/core';
import { Device } from '..';

type LinkDeviceReply = { info: any, publicKey: string, privateKey: string, deviceId: string, devicePublicKey: string };

class LinkDeviceOffer extends HashedObject implements SpaceEntryPoint {

    static className = 'hhs-home/v0/LinkDeviceOffer';

    reply?: MutableReference<string>;
    replyReceivingStatus?: MutableReference<'error'|'success'>;

    newDevice?: MutableReference<Device>;

    _secret?: string;

    _node?: PeerNode;
    _peerGroup?: PeerGroupInfo;
    _broadcasting = false;

    _discoveryConstant?: HashedLiteral;

    constructor(secretHex?: string) {
        super();

        if (secretHex !== undefined) {

            const keygen = new KeyGenImpl();
            const rmd    = new RMDImpl();

            //TODO: add something related to the current date to the salt value

            const id = keygen.derive(secretHex, rmd.rmd160hex(Strings.hexToBase64(secretHex)), 10000);

            this.setId(id);
            this.addDerivedField('reply', new MutableReference<string>());
            this.addDerivedField('replyReceivingStatus', new MutableReference<'error'|'success'>());
            this.addDerivedField('newDevice', new MutableReference<Device>());

            this._secret = keygen.derive(secretHex, id, 25000);

            this._discoveryConstant = new HashedLiteral(Hashing.forValue(id));
        }
    }

    createReply(id: Identity, keypair: RSAKeyPair, localDevice: Device) {

        if (this._secret === undefined) {
            throw new Error('LinkDeviceOffer cannot create a reply if the secret is not present.');
        }

        const hmac = new HMACImpl();
        const rng  = new RNGImpl();
        const chacha = new ChaCha20Impl();

        const plain = JSON.stringify({info: id.info, publicKey: keypair.publicKey, privateKey: keypair.privateKey, deviceId: localDevice.getId(), devicePublicKey: localDevice.publicKey?.publicKey } as LinkDeviceReply);
        const plainHMAC = plain + hmac.hmacSHA256hex(plain, this._secret);
        const nonce = rng.randomHexString(96);
        const reply = chacha.encryptHex(plainHMAC, this._secret, nonce) + nonce;

        this.reply?.setValue(reply);
    }

    hasReply(): boolean {
        return this.reply?.getValue() !== undefined;
    }

    async decodeReply(): Promise<{id: Identity, remoteDevice: Device} | undefined> {

        if (this._secret === undefined) {
            throw new Error('LinkDeviceOffer cannot decode a reply if the secret is not present.');
        }

        const chacha = new ChaCha20Impl();
        const hmac   = new HMACImpl();

        const encodedReply = this.reply?.getValue();

        if (encodedReply !== undefined) {
            const nonce  = encodedReply.slice(-24);
            const cypher = encodedReply.substring(0, encodedReply.length-24);

            if (nonce.length === 24) {
                const plainHMAC    = chacha.decryptHex(cypher, this._secret, nonce);
                const receivedHMAC = plainHMAC.slice(-64);
                const plain        = plainHMAC.substring(0, plainHMAC.length-64);

                if (receivedHMAC === hmac.hmacSHA256hex(plain, this._secret)) {
                    try {
                        const reply = JSON.parse(plain) as LinkDeviceReply;

                        if (HashedObject.isLiteral(reply.info)) {

                            const keypair = await RSAKeyPair.fromKeys(reply.publicKey, reply.privateKey);
                            
                            const id = Identity.fromKeyPair(reply.info, keypair);

                            const remoteDevicePublicKey = await RSAPublicKey.fromKeys(reply.devicePublicKey);
                            const remoteDevice = new Device(id, remoteDevicePublicKey, reply.deviceId);

                            return {id:id, remoteDevice: remoteDevice};
                        }
                    
                    } catch (e) {
                        return undefined;
                    }
                     
                }
            }
        }

        return undefined;
    }

    setReplyReceivedStatus(status: 'success'|'error') {
        this.replyReceivingStatus?.setValue(status);
    }

    getClassName(): string {
        return LinkDeviceOffer.className;
    }

    init(): void {

    }

    async validate(_references: Map<string, HashedObject>): Promise<boolean> {
        return this.hasId() && 
               this.reply instanceof MutableReference && this.checkDerivedField('reply') &&
               this.replyReceivingStatus instanceof MutableReference && this.checkDerivedField('replyReceivingStatus') &&
               this.newDevice instanceof MutableReference && this.checkDerivedField('newDevice');
    }

    async startSync(broadcast=false): Promise<void> {

        if (this._secret === undefined) {
            throw new Error('LinkDeviceOffer cannot start synchronizing if the secret is not present.');
        }

        const resources = this.getResources();

        if (resources === undefined) {
            throw new Error('LinkDeviceOffer cannot start synchronizing if the object resources have not been set.');
        }

        await this.loadAndWatchForChanges();

        const localPeerForDiscovery = resources.getPeersForDiscovery()[0];

        const localPeer      = SecretBasedPeerSource.encryptPeer(localPeerForDiscovery, this._secret);

        const endpointParser = SecretBasedPeerSource.makeSecureEndpointParser(resources.getEndointParserForDiscovery(), this._secret);

        const discoveryPeerSource = new ObjectDiscoveryPeerSource(resources.mesh, this._discoveryConstant as HashedLiteral, resources.config.linkupServers, localPeer.endpoint, endpointParser);

        //const peerSource = new SecretBasedPeerSource(discoveryPeerSource, this._secret);

        this._peerGroup = {
            id: this.hash(), 
            localPeer: localPeer, 
            peerSource: discoveryPeerSource
        };

        this._node = new PeerNode(resources);
        this._broadcasting = broadcast;

        if (broadcast) {
            this._node?.broadcast(this._discoveryConstant as HashedLiteral, resources.config.linkupServers, [localPeer.endpoint])
        }

        this._node?.sync(this.reply as MutableReference<string>, SyncMode.single, this._peerGroup);
        this._node?.sync(this.replyReceivingStatus as MutableReference<'success'|'error'>, SyncMode.single, this._peerGroup);
        this._node?.sync(this.newDevice as MutableReference<Device>, SyncMode.single, this._peerGroup);
    }
    
    async stopSync(): Promise<void> {

        if (this._broadcasting) {
            this._node?.stopBroadcast(this._discoveryConstant as HashedLiteral);
            this._broadcasting = false;
        }

        this._node?.stopSync(this.reply as MutableReference<string>, this._peerGroup?.id);
        this._node?.stopSync(this.replyReceivingStatus as MutableReference<'success'|'errro'>, this._peerGroup?.id);
        this._node?.stopSync(this.newDevice as MutableReference<Device>, this._peerGroup?.id);
        this._node = undefined;
    }

}

ClassRegistry.register(LinkDeviceOffer.className, LinkDeviceOffer);

export { LinkDeviceOffer };