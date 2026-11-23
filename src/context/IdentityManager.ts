import { isContextIdentifier } from '@/context/SessionManager';

export class IdentityManager {
  #identity: string | undefined;

  get userId(): string | undefined {
    return this.#identity;
  }

  identify(userId: string): boolean {
    if (!isContextIdentifier(userId)) {
      return false;
    }

    this.#identity = userId;
    return true;
  }

  resetIdentity(): void {
    this.#identity = undefined;
  }
}
