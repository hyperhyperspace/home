import { HashedObject, MutableReference, SpaceEntryPoint } from '@hyper-hyper-space/core';


class Home extends HashedObject implements SpaceEntryPoint {

    static className = 'hhs/v0/Home';

    constructor() {
        super();
    }

    getClassName(): string {
        return Home.className;
    }
    
    init(): void {

    }
    
    async validate(_references: Map<string, HashedObject>): Promise<boolean> {
        
        return true;
    }
    
    startSync(): Promise<void> {
        throw new Error('Method not implemented.');
    }

    stopSync(): Promise<void> {
        throw new Error('Method not implemented.');
    }

}

export { Home };