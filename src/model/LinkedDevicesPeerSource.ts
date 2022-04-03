import { PeerSource, PeerInfo, Identity, IdentityPeer, Shuffle, Hash } from '@hyper-hyper-space/core';
import { MutableSet } from '@hyper-hyper-space/core';

import { Device } from './Device';

class LinkedDevicesPeerSource implements PeerSource {

    owner: Identity;
    ownerHash: Hash;
    localDevice: Device;
    devices: MutableSet<Device>;
    linkupServer: string;

    constructor(owner: Identity, localDevice: Device, devices: MutableSet<Device>, linkupServer: string) {

        this.owner     = owner;
        this.ownerHash = owner.hash();

        this.localDevice = localDevice;
        this.devices     = devices;

        this.linkupServer = linkupServer;

    }

    async getPeers(count: number): Promise<PeerInfo[]> {
        const candidates = new Array<Device>();

        for (const device of this.devices.values()) {
            if (!this.localDevice.equals(device)) {
                candidates.push(device);
            }
        }

        Shuffle.array(candidates);

        const peers = new Array<PeerInfo>();

        for (const device of candidates) {
            if (peers.length === count) {
                break;
            }

            peers.push(this.getPeerForDevice(device));
        }

        return peers;
    }

    async getPeerForEndpoint(endpoint: string): Promise<PeerInfo | undefined> {
        try {
            const idPeer = new IdentityPeer();
            idPeer.initFromEndpoint(endpoint);

            if (idPeer.info !== undefined && this.devices.hasByHash(idPeer.info) &&
                idPeer.identityHash === this.ownerHash) {
                
                return idPeer.asPeer();
            } else {
                return undefined;
            }

        } catch (e: any) {
            return undefined;
        }
    }

    getEndpointForDevice(device: Device): string {
        return this.getPeerForDevice(device).endpoint;
    }

    getPeerForDevice(device: Device): PeerInfo {
        return IdentityPeer.fromIdentity(this.owner, this.linkupServer, device.hash()).asPeerIfReady();
    }

}

export { LinkedDevicesPeerSource };