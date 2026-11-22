import * as OTPAuth from 'otpauth';

const PERIOD = 30;

export class TotpService {
  constructor({ issuer }) {
    this.issuer = issuer;
  }

  generateSecret() {
    return new OTPAuth.Secret({ size: 20 }).base32;
  }

  #totp(secret, label = 'account') {
    return new OTPAuth.TOTP({ issuer: this.issuer, label, algorithm: 'SHA1', digits: 6, period: PERIOD, secret: OTPAuth.Secret.fromBase32(secret) });
  }

  uri(secret, label) {
    return this.#totp(secret, label).toString();
  }

  /** @returns the matched time step (for replay protection) or null. */
  verify(secret, token) {
    const delta = this.#totp(secret).validate({ token, window: 1 });
    return delta === null ? null : Math.floor(Date.now() / 1000 / PERIOD) + delta;
  }
}
