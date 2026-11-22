import argon2 from 'argon2';

// OWASP-recommended argon2id parameters.
const OPTIONS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };

export class PasswordHasher {
  #dummyHash = null;

  hash(password) {
    return argon2.hash(password, OPTIONS);
  }

  async verify(hash, password) {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  needsRehash(hash) {
    return argon2.needsRehash(hash, OPTIONS);
  }

  /** Burns the same CPU as a real verification so response time doesn't reveal whether an account exists. */
  async verifyDummy(password) {
    this.#dummyHash ??= await this.hash('dummy-password-for-timing');
    await this.verify(this.#dummyHash, password);
  }
}
