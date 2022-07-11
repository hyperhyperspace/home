import { ClassRegistry, HashedObject } from '@hyper-hyper-space/core';


class Message extends HashedObject{

    static className = 'hhs-home/v0/Message';

    timestamp?: number;
    content?: string;

    getClassName(): string {
        return Message.className;
    }

    init(): void {
        
    }

    async validate(references: Map<string, HashedObject>): Promise<boolean> {
        if (typeof this.timestamp !== 'number') {
            return false;
        }

        if (typeof this.content !== 'string') {
            return false;
        }

        if (this.hasAuthor()) {
            return false;
        }

         return true;
    }
}

ClassRegistry.register(Message.className, Message);

export { Message };