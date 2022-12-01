import { ClassRegistry, Hash, HashedObject, Hashing, Identity, MutableReference, MutableSet, MutableSetEvents, MutationEvent, MutationObserver, RSAPublicKey } from '@hyper-hyper-space/core';
import { SpaceLink } from '../folders/SpaceLink';

import { Profile } from './Profile';

type IdentityExport = {pk: string, i: any, h: Hash};

class Contacts extends HashedObject {

    static className = 'hhs/v0/Contacts';

    profileIsPublic?: MutableReference<boolean>;
    current?: MutableSet<Profile>;
    hosting?: MutableSet<Identity>;

    _hostingPerProfile?: MutableSet<Profile>;
    _hostingConfig?: MutableSet<MutableReference<string>>;

    _hostingConfigMap?: Map<Hash, SpaceLink>;

    _hostingObserver?: MutationObserver;
    _hostingLinksObserver?: MutationObserver;
    

    constructor(owner?: Identity, id?: string) {
        super();

        if (owner !== undefined) {

            this.setAuthor(owner);

            if (id !== undefined) {
                this.setId(id);
            } else {
                this.setRandomId();
            }

            this.addDerivedField('profileIsPublic', new MutableReference({writer: owner, acceptedTypes: ['boolean']}));
            this.addDerivedField('current', new MutableSet({writer: owner, acceptedTypes: [Profile.className]}));
            this.addDerivedField('hosting', new MutableSet({writer: owner, acceptedTypes: [Identity.className]}));
        }
    }

    getClassName(): string {
        return Contacts.className;
    }

    init(): void {

    }

    async validate(_references: Map<string, HashedObject>): Promise<boolean> {
        
        if (this.getAuthor() === undefined) {
            return false;
        }

        // profileIsPublic

        if (!(this.profileIsPublic instanceof MutableReference)) {
            return false;
        }

        if (this.profileIsPublic.getAuthor() !== undefined) {
            return false;
        }

        if (!this.profileIsPublic.hasSingleWriter() || !(this.getAuthor()?.equals(this.profileIsPublic.getSingleWriter()))) {
            return false;
        }

        if (!this.profileIsPublic.validateAcceptedTypes(['boolean'])){
            return false;
        }

        if (!this.checkDerivedField('profileIsPublic')) {
            return false;
        }

        // current

        if (!(this.current instanceof MutableSet)) {
            return false;
        }

        if (this.current.getAuthor() !== undefined) {
            return false;
        }

        if (!(this.getAuthor()?.equals(this.current.getSingleWriter()))) {
            return false;
        }

        if (!this.current.validateAcceptedTypes([Profile.className])){
            return false;
        }
        
        if (!this.checkDerivedField('current')) {
            return false;
        }

        // hosting

        if (!(this.hosting instanceof MutableSet)) {
            return false;
        }

        if (this.hosting.getAuthor() !== undefined) {
            return false;
        }

        if (!(this.getAuthor()?.equals(this.hosting.getSingleWriter()))) {
            return false;
        }

        if (!this.hosting.validateAcceptedTypes([Identity.className])){
            return false;
        }
        
        if (!this.checkDerivedField('hosting')) {
            return false;
        }

        return true;
    }

    loadHostingPerProfile() {
        if (this._hostingPerProfile === undefined) {
            this._hostingPerProfile = new MutableSet();
            this._hostingConfig    = new MutableSet();
            this._hostingConfigMap = new Map();
            this._hostingObserver = (ev: MutationEvent) => {
                if (ev.emitter === this.current) {
                    const profile = ev.data as Profile;
                    const ownerHash = profile.owner?.getLastHash() as Hash;
                    if (ev.action === MutableSetEvents.Add) {
                        if (this.hosting?.hasByHash(ownerHash) && !this._hostingPerProfile?.hasByHash(profile.getLastHash())) {
                            this.addHostingProfile(profile.getLastHash());
                        }
                    } else if (ev.action === MutableSetEvents.Delete) {
                        if (this._hostingPerProfile?.hasByHash(profile.getLastHash())) {
                            this.removeHostingProfile(profile.getLastHash());
                        }
                    }
                } else if (ev.emitter === this.hosting) {
                    const id = ev.data as Identity;
                    const profileHash = new Profile(id).hash();
                    if (ev.action === MutableSetEvents.Add) {
                        if (this.current?.hasByHash(profileHash) && !this._hostingPerProfile?.hasByHash(profileHash)) {
                            this.addHostingProfile(profileHash);
                        }
                    } else if (ev.action === MutableSetEvents.Delete) {
                        if (this._hostingPerProfile?.hasByHash(profileHash)) {
                            this.removeHostingProfile(profileHash);
                        }
                    }
                }
            };

            this._hostingLinksObserver = (ev: MutationEvent) => {
                if (ev.emitter instanceof MutableSet && ev.data instanceof SpaceLink) {
                    const p = new Profile(ev.emitter.getSingleWriter() as Identity);
                    const link = ev.data as SpaceLink;
                    if (ev.action === MutableSetEvents.Add) {
                        this.addHostingLink(link, p);
                    } else if (ev.action === MutableSetEvents.Delete) {
                        this.removeHostingLink(link, p);
                    }
                }
            }

            this.current?.addObserver(this._hostingObserver);
            this.hosting?.addObserver(this._hostingObserver);

            for (const id of this.hosting?.values() || []) {
                const p = new Profile(id);
                if (this.current?.hasByHash(p.getLastHash()) && !this._hostingPerProfile.hasByHash(p.getLastHash())) {
                    this.addHostingProfile(p.getLastHash());
                }
            }

        }
    }

    private addHostingProfile(profileHash: Hash) {
        if (this._hostingPerProfile !== undefined) {
            const p = this.current?.get(profileHash);
            if (p !== undefined) {
                this._hostingPerProfile.add(p);
                
                p.published?.addObserver(this._hostingLinksObserver as MutationObserver);
                p.startSync();

                for (const link of p.published?.values() || []) {
                    this.addHostingLink(link, p);
                }
            }
        }
    }

    private removeHostingProfile(profileHash: Hash) {
        if (this._hostingPerProfile !== undefined) {
            const p = this._hostingPerProfile.get(profileHash);
            if (p !== undefined) {
                if (this._hostingLinksObserver !== undefined) { 
                    p.published?.removeObserver(this._hostingLinksObserver);
                }

                p.stopSync();

                for (const link of p.published?.values() || []) {
                    this.removeHostingLink(link, p);
                }
            }
        }

    }

    private addHostingLink(link: SpaceLink, p: Profile) {
        const config = this.getHostingConfig(link.getLastHash(), p.getLastHash());

        link.name?.loadAndWatchForChanges();
        if (!this._hostingConfig?.hasByHash(config.getLastHash())) {
            this._hostingConfigMap?.set(config.getLastHash(), link);
            this.getStore().save(config).then(() => {
                this._hostingConfig?.add(config);
                config.loadAndWatchForChanges();
            });
        }
    }

    private removeHostingLink(link: SpaceLink, p: Profile) {
        const configHash = this.getHostingConfig(link.getLastHash(), p.getLastHash()).hash();

        const config = this._hostingConfig?.get(configHash);

        if (config !== undefined) {
            link.name?.dontWatchForChanges();
            const conf = this._hostingConfig?.get(configHash);
            if (conf !== undefined) {
                conf.dontWatchForChanges();
                this._hostingConfig?.deleteByHash(configHash);
                this._hostingConfigMap?.delete(conf.getLastHash());
            }
            
        }
    }

    getHostingConfig(linkHash: Hash, profileHash: Hash) {
        const config = new MutableReference<string>({writer: this.getAuthor(), acceptedElements: ['auto', 'on', 'off']});
        config.setId(Hashing.forString('config-for-' + linkHash + '-in-' + profileHash));

        return config;
    }

    unloadHostingPerProfile() {
        if (this._hostingPerProfile !== undefined) {
            const hosting = this._hostingPerProfile;
            this._hostingPerProfile = undefined;
            this._hostingConfig = undefined;
            this._hostingConfigMap = undefined;
            if (this._hostingObserver !== undefined) {
                this.current?.removeObserver(this._hostingObserver);
                this.hosting?.removeObserver(this._hostingObserver);
            }
            
            for (const p of hosting.values() || []) {
                this.removeHostingProfile(p.getLastHash());
            }
        }
    }

    static exportIdentity(id: Identity): IdentityExport {

        return { pk: id.getPublicKey().publicKey as string, i: id.info, h: id.hash() };
    }

    static async importIdentity(exp: IdentityExport): Promise<Identity> {
        //const kp = await RSAKeyPair.fromKeys(exp.pk);
        //const id = Identity.fromKeyPair(exp.i, kp);

        const pk = RSAPublicKey.fromKeys(exp.pk);
        const id = Identity.fromPublicKey(exp.i, pk);

        if (id.hash() !== exp.h) {
            throw new Error('Attempted to process an invalid profile export: hashing mismatch');
        }

        return id;
    }
}

ClassRegistry.register(Contacts.className, Contacts);

export { Contacts }