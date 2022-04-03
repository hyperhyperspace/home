import { MutationEvent, MutationObserver, LinkupManager, SyncMode } from '@hyper-hyper-space/core';
import { ClassRegistry, Hash, HashedObject, Hashing } from '@hyper-hyper-space/core';
import { Identity } from '@hyper-hyper-space/core';
import { MutableSet } from '@hyper-hyper-space/core';
import { SpaceEntryPoint } from '@hyper-hyper-space/core';
import { PeerNode, PeerGroupInfo } from '@hyper-hyper-space/core';

import { MultiMap } from '@hyper-hyper-space/core';

import { Folder } from './Folder';
import { FolderTree } from './FolderTree';
import { Device } from './Device';
import { LocalDeviceInfo } from './LocalDeviceInfo';
import { LinkedDevicesPeerSource } from './LinkedDevicesPeerSource';
import { SpaceLink } from './SpaceLink';

type FolderItem = Folder | SpaceLink;

class Home extends HashedObject implements SpaceEntryPoint {

    static className = 'hhs/v0/Home';

    desktop?: FolderTree;
    devices?: MutableSet<Device>

    _allSpaceLinks: Map<Hash, FolderItem>;
    _allContainingFolders: MultiMap<Hash, Hash>;
    _desktopMutationObserver: MutationObserver;
    _devicesMutationObserver: MutationObserver;

    _devicePeers?: PeerGroupInfo;
    _node?: PeerNode;
    _localDevice?: Device;

    constructor(owner?: Identity) {
        super();

        if (owner !== undefined) {
            this.setAuthor(owner);
            this.setId(this.getDerivedId());

            this.desktop = new FolderTree(owner, this.getDerivedFieldId('desktop'));
            
            const devices = new MutableSet<Device>();
            devices.setAuthor(owner);

            this.addDerivedField('devices', devices);
        }

        this._allSpaceLinks = new Map();
        this._allContainingFolders = new MultiMap();

        this._devicesMutationObserver = {
            callback: (ev: MutationEvent) => {
                const device = ev.data as Device;
                
                if (ev.action === 'add') {
                    device.name?.loadAndWatchForChanges();
                } else if (ev.action === 'delete') {
                    device.name?.watchForChanges(false);
                }

            }
        };

        this._desktopMutationObserver = {
            callback: (_ev: MutationEvent) => {

            }
        }

        
    }

    getDesktop(): Folder {
        return this.desktop as Folder;
    }

    getClassName(): string {
        return Home.className;
    }
    
    init(): void {

    }

    async validate(_references: Map<string, HashedObject>): Promise<boolean> {
        
        return true;
    }
    
    async startSync(): Promise<void> {

        let resources = this.getResources();

        if (resources === undefined) {
            throw new Error('Cannot start home sync: resources not configured.');
        }

        if (resources.config?.id === undefined) {
            throw new Error('Cannot start home sync: local identity has not been defined.');
        }

        if (resources.store === undefined) {
            throw new Error('Cannot start home sync: a local store has not been configured.')
        }

        await this.loadAndWatchForChanges();

        this._localDevice = await this.findLocalDevice();

        if (this._localDevice === undefined) {
            throw new Error('Cannot start home sync: a local device has not been defined.');
        }

        const peerSource = new LinkedDevicesPeerSource(this.getAuthor() as Identity, this._localDevice, this.devices as MutableSet<Device>, LinkupManager.defaultLinkupServer);

        this._devicePeers = {id: 'home-devices-for-' + this.getAuthor()?.hash(), localPeer: peerSource.getPeerForDevice(this._localDevice), peerSource: peerSource };

        this._node = new PeerNode(resources);


        this._node?.sync(this, SyncMode.recursive, this._devicePeers);
    }

    async stopSync(): Promise<void> {
        this._node?.stopSync(this, this._devicePeers?.id);
        this._node = undefined;
    }

    private getDerivedId() {
        return Hashing.forString('home-for-' + this.getAuthor()?.hash());
    }

    async addDevice(device: Device, local=false) {

        if (this.devices === undefined) {
            throw new Error('Trying to add a new device to home, but devices set has not been loaded.');
        }

        this.devices.add(device);
        await this.devices.saveQueuedOps();
        
        if (local) {
            const localDeviceInfo = new LocalDeviceInfo(device.hash(), this.getAuthor());
            await this.getStore().save(localDeviceInfo);
        }
    }

    async findLocalDevice(): Promise<Device|undefined> {

        if (this.devices === undefined) {
            return undefined;
        }

        for (const device of this.devices.values()) {
            const localDeviceInfo = new LocalDeviceInfo(device.hash(), this.getAuthor());
            if (await this.getStore().load(localDeviceInfo.hash()) !== undefined) {
                return device;
            }
        }

        return undefined;
    }

    // load / store

    async loadAndWatchForChanges(loadBatchSize=128): Promise<void> {

        this.desktop?.addMutationObserver(this._desktopMutationObserver);
        this.devices?.addMutationObserver(this._devicesMutationObserver);
        
        await this.desktop?.loadAndWatchForChanges(loadBatchSize);
        await this.devices?.loadAndWatchForChanges(loadBatchSize);

    }

    watchForChanges(auto: boolean): boolean {

        this.desktop?.addMutationObserver(this._desktopMutationObserver);
        this.devices?.addMutationObserver(this._devicesMutationObserver);
        
        return this.desktop?.watchForChanges(auto) ||
               this.devices?.watchForChanges(auto) || false;

    }

    async loadAllChanges() {
        this.desktop?.loadAllChanges();
        this.devices?.loadAllChanges();
    }

}

ClassRegistry.register(Home.className, Home);

export { Home };