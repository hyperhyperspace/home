import { MutationEvent, MutationObserver, LinkupManager, SyncMode, MutableArray, Space } from '@hyper-hyper-space/core';
import { ClassRegistry, Hash, HashedObject, Hashing } from '@hyper-hyper-space/core';
import { Identity } from '@hyper-hyper-space/core';
import { MutableSet, MutableSetEvents } from '@hyper-hyper-space/core';
import { SpaceEntryPoint } from '@hyper-hyper-space/core';
import { MeshNode, PeerGroupInfo } from '@hyper-hyper-space/core';

import { MultiMap } from '@hyper-hyper-space/core';

import { Folder } from './folders/Folder';
import { FolderTree, FolderTreeEvents } from './folders/FolderTree';
import { SpaceLink } from './folders/SpaceLink';

import { Device } from './devices/Device';
import { LocalDeviceInfo } from './devices/LocalDeviceInfo';
import { LinkedDevicesPeerSource } from './devices/LinkedDevicesPeerSource';

import { Profile } from './social/Profile';
import { Contacts } from './social/Contacts';


type FolderItem = Folder | SpaceLink;

class Home extends HashedObject implements SpaceEntryPoint {

    static className = 'hhs/v0/Home';

    desktop?: FolderTree;
    devices?: MutableSet<Device>

    profile?: Profile;
    contacts?: Contacts;

    _allSpaceLinks: Map<Hash, FolderItem>;
    _allContainingFolders: MultiMap<Hash, Hash>;
    _desktopMutationObserver: MutationObserver;
    _devicesMutationObserver: MutationObserver;

    _devicePeers?: PeerGroupInfo;
    _node?: MeshNode;
    _localDevice?: Device;

    constructor(owner?: Identity) {
        super();

        this._allSpaceLinks = new Map();
        this._allContainingFolders = new MultiMap();

        this._devicesMutationObserver = (ev: MutationEvent) => {

            if (ev.emitter.equals(this.devices)) {

                const device = ev.data as Device;

                if (ev.action === MutableSetEvents.Add) {

                    let prom = Promise.resolve();

                    if (this.isWatchingForChanges()) {
                        prom = prom.then(() => { device.loadAndWatchForChanges() });
                    }
                    
                    prom.then(() => { this._node?.sync(device, SyncMode.full, this._devicePeers); });

                } else if (ev.action === MutableSetEvents.Delete) {
                    device.dontWatchForChanges();
                    this._node?.stopSync(device, this._devicePeers?.id);
                }
            }

            return false;
        };

        this._desktopMutationObserver = (ev: MutationEvent) => {

            if (ev.emitter.equals(this.desktop)) {

                const item = ev.data as FolderItem;

                if (ev.action === FolderTreeEvents.AddItem) {


                    //if (this.isWatchingForChanges()) {
                    //    item.loadAndWatchForChanges();
                    //}

                    if (this._node !== undefined) {
                        console.log('starting sync for ' + (ev.data as Folder).name?._value + ' (hash ' + ev.data?.getLastHash() + ')');
                        this._node?.sync(item, SyncMode.full, this._devicePeers);
                    }

                    
                    

                } else if (ev.action === FolderTreeEvents.RemoveItem) {

                    if (this._node !== undefined) {
                        console.log('stopping sync for ' + (ev.data as Folder).name?._value + ' (hash ' + ev.data?.getLastHash() + ')');
                    }

                    //item.dontWatchForChanges();
                    this._node?.stopSync(item, this._devicePeers?.id);
                }

            }

            return false;
        };

        if (owner !== undefined) {
            this.setAuthor(owner);
            this.setId(this.getDerivedId());

            this.desktop = new FolderTree(owner, this.getDerivedFieldId('desktop'));

            this.desktop.root?.name?.setValue('Desktop');
            
            const devices = new MutableSet<Device>({writer: owner, acceptedTypes: [Device.className]});
            devices.setAuthor(owner);
            this.addDerivedField('devices', devices);

            this.profile = new Profile(owner);

            this.contacts = new Contacts(owner, this.getDerivedFieldId('contacts'));

            this.init();
        }

        
        
    }

    getDesktop(): Folder {
        return this.desktop?.root as Folder;
    }

    getClassName(): string {
        return Home.className;
    }
    
    init(): void {
        this.devices?.addObserver(this._devicesMutationObserver);
        this.desktop?.addObserver(this._desktopMutationObserver);
    }

    async validate(_references: Map<string, HashedObject>): Promise<boolean> {
        
        if (this.getAuthor() === undefined) {
            return false;
        }

        if (this.getId() !== this.getDerivedId()) {
            return false;
        }

        if (!(this.desktop instanceof FolderTree)) {
            return false;
        }

        if (!this.getAuthor()?.equals(this.desktop?.getAuthor())) {
            return false;
        }

        if (!this.checkDerivedField('desktop')) {
            return false;
        }

        if (!(this.devices instanceof MutableSet)) {
            return false;
        }

        if (!this.getAuthor()?.equals(this.devices?.getAuthor())) {
            return false;
        }

        if (!(this.getAuthor()?.equals(this.devices.getSingleWriter()))) {
            return false;
        }


        if (!this.devices.validateAcceptedTypes([Device.className])) {
            return false;
        }

        if (!(this.profile instanceof Profile)) {
            return false;
        }

        if (!this.getAuthor()?.equals(this.profile?.getAuthor())) {
            return false;
        }

        return true;
    }
    
    async loadHomeDevice(): Promise<void> {
        if (this._localDevice === undefined) {
            this._localDevice = await this.findLocalDevice();
        }
    }

    async startSync(devicesOnly=false): Promise<void> {

        let resources = this.getResources();

        if (resources === undefined) {
            throw new Error('Cannot start home sync: resources not configured.');
        }

        if (resources.store === undefined) {
            throw new Error('Cannot start home sync: a local store has not been configured.')
        }
        
        await this.loadAndWatchForChanges();
        //await this.desktop?.root?.loadAndWatchForChanges();

        await this.loadHomeDevice();

        if (this._localDevice === undefined) {
            throw new Error('Cannot start home sync: a local device has not been defined.');
        }

        const peerSource = new LinkedDevicesPeerSource(this.getAuthor() as Identity, this._localDevice, this.devices as MutableSet<Device>, LinkupManager.defaultLinkupServer);

        this._devicePeers = {id: 'home-devices-for-' + this.getAuthor()?.hash(), localPeer: peerSource.getPeerForDevice(this._localDevice), peerSource: peerSource };

        const node = new MeshNode(resources);

        const devices = this.devices?.values()

        if (devicesOnly) {
            this._node = node;    
        } else {

            node.sync(this.desktop as FolderTree, SyncMode.full, this._devicePeers);

            console.log('root folder has ' + this.desktop?.root?.items?.contents().length + ' items')
            console.log('tree has ' + Array.from((this.desktop as FolderTree).currentItems()).length + ' items')
            console.log('starting NOW')

            this._node = node;

            const folderItems = this.desktop?.currentItems();

            if (folderItems !== undefined) {
                for (const item of folderItems) {
                    this._node?.sync(item, SyncMode.full, this._devicePeers);
                }
            }

            node.sync(this.profile as Profile, SyncMode.full, this._devicePeers);
            node.sync(this.contacts as Contacts, SyncMode.full, this._devicePeers)

            this.contacts?.profileIsPublic?.addObserver(() => {
                const profile = this.profile as Profile;
                
                if (this.contacts?.profileIsPublic?._value) {
                    if (!profile.syncIsEnabled()) {
                        profile.startSync({owner: true});
                    }
                } else {
                    profile.stopSync();
                }
            });

            if (this.contacts?.profileIsPublic) {
                (this.profile as Profile).startSync({owner: true});
            }
        }

        this._node?.sync(this.devices as MutableSet<Device>, SyncMode.single, this._devicePeers);
        
        if (devices !== undefined) {
            for (const device of devices) {
                this._node?.sync(device, SyncMode.full, this._devicePeers);
            }
        }
        
    }

    async stopSync(): Promise<void> {
        this._node?.stopSync(this, this._devicePeers?.id);

        this._node?.stopSync(this.profile as Profile, this._devicePeers?.id);
        this._node?.stopSync(this.contacts as Contacts, this._devicePeers?.id)

        const devices = this.devices?.values()

        if (devices !== undefined) {
            for (const device of devices) {
                this._node?.stopSync(device, this._devicePeers?.id);
            }
        }

        const folderItems = this.desktop?.currentItems();

        if (folderItems !== undefined) {
            for (const item of folderItems) {
                this._node?.stopSync(item, SyncMode.full);
            }
        }

        this._node = undefined;
    }

    private getDerivedId() {
        return Hashing.forString('home-for-' + this.getAuthor()?.hash());
    }

    async addDevice(device: Device, local=false) {

        if (this.devices === undefined) {
            throw new Error('Trying to add a new device to home, but devices set has not been loaded.');
        }

        console.log('using store for add device:')
        console.log(this.getStore());
        console.log('trying to save:')
        console.log(device);

        await this.getStore().save(device);

        await this.devices.add(device);
        
        await this.getStore().save(this.devices);
        
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
            if (await this.getStore().load(localDeviceInfo.hash(), false) !== undefined) {
                return device;
            }
        }

        return undefined;
    }

    toggleWatchForChanges(enabled: boolean): boolean {

        const before = super.toggleWatchForChanges(enabled);

        for (const device of (this.devices as MutableSet<Device>).values()) {
            device.toggleWatchForChanges(enabled);

            if (enabled) {
                device.loadAllChanges();
            }
        }

        for (const item of (this.desktop?.root?.items as MutableArray<FolderItem>).contents()) {
            if (item instanceof Folder) {
                item.toggleWatchForChanges(enabled);

                if (enabled) {
                    item.loadAllChanges();
                }
            }
        }

        return before;

    }

    // load / store

   /* async loadAndWatchForChanges(loadBatchSize=128): Promise<void> {

        this.watchForChanges(true);
        
        await this.loadAllChanges(loadBatchSize);

    }

    watchForChanges(auto: boolean): boolean {

        const devices = this.devices?.values()

        if (devices !== undefined) {
            for (const device of devices) {
                device.watchForChanges(auto);
                if (auto) {
                    device.loadAllChanges();
                }
            }
        }

        
        const items = this.desktop?.allItems();

        if (items !== undefined) {
            for (const item of items) {
                item.watchForChanges(auto);
                if (auto) {
                    item.loadAllChanges();
                }
            }
        }

        this._watchingForChanges = auto;
        const desktopWatchForChanges = this.desktop?.watchForChanges(auto);
        const devicesWatchForChanges = this.devices?.watchForChanges(auto);
        
        return desktopWatchForChanges ||
               devicesWatchForChanges || false;

    }

    async loadAllChanges(loadBatchSize=128) {
        await this.desktop?.loadAllChanges(loadBatchSize);
        await this.devices?.loadAllChanges(loadBatchSize);
    }*/

    getName() {
        return "Home for " + Space.getWordCodingFor(this.getAuthor() as Identity);
    }
}

ClassRegistry.register(Home.className, Home);

export { Home };