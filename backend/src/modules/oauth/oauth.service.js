import { AUDIT_EVENTS } from '@app/shared';
import { randomToken, safeEqual, sha256 } from '../../shared/security/crypto.js';
import { ForbiddenError, UnauthorizedError } from '../../shared/errors.js';

const GOOGLE = {
  authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
  token: 'https://oauth2.googleapis.com/token',
  userinfo: 'https://openidconnect.googleapis.com/v1/userinfo',
};

/** Google sign-in via authorization-code flow with PKCE and a signed, short-lived state cookie. */
export class OAuthService {
  constructor({ repos, uow, tokens, auth, tenants, audit, mfaTokens, settings }) {
    Object.assign(this, { repos, uow, tokens, auth, tenants, audit, mfaTokens, settings });
  }

  get redirectUri() { return new URL('/api/v1/auth/oauth/google/callback', this.settings.appUrl).toString(); }

  async authorizationUrl() {
    const state = randomToken(16);
    const verifier = randomToken(32);
    const url = new URL(GOOGLE.authorize);
    url.search = new URLSearchParams({
      client_id: this.settings.clientId, redirect_uri: this.redirectUri, response_type: 'code', scope: 'openid email profile',
      state, code_challenge: sha256(verifier), code_challenge_method: 'S256', prompt: 'select_account',
    }).toString();
    return { url: url.toString(), stateToken: await this.tokens.signState({ state, verifier }) };
  }

  /** @returns { session } or { mfaToken } */
  async handleCallback({ code, state, stateToken }, ctx) {
    const saved = await this.tokens.verifyState(stateToken ?? '').catch(() => null);
    if (!saved || !code || !state || !safeEqual(String(state), saved.state)) throw new UnauthorizedError('Google sign-in failed. Please try again.');

    const profile = await this.#fetchProfile(code, saved.verifier);
    if (!profile.email_verified) throw new ForbiddenError('Your Google email address is not verified');
    const user = await this.#findOrCreateUser(profile);
    if (user.status !== 'active') throw new ForbiddenError('This account has been disabled');

    await this.audit.record(AUDIT_EVENTS.OAUTH_LOGIN, { userId: user.id, ctx });
    if (user.mfaEnabled) return { mfaToken: await this.mfaTokens.signMfa({ userId: user.id }) };
    return { session: await this.auth.completeExternalLogin(user, ctx) };
  }

  async #fetchProfile(code, verifier) {
    const tokenResponse = await fetch(GOOGLE.token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code, client_id: this.settings.clientId, client_secret: this.settings.clientSecret,
        redirect_uri: this.redirectUri, grant_type: 'authorization_code', code_verifier: verifier,
      }),
    });
    if (!tokenResponse.ok) throw new UnauthorizedError('Google sign-in failed. Please try again.');
    const { access_token: accessToken } = await tokenResponse.json();
    const profileResponse = await fetch(GOOGLE.userinfo, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!profileResponse.ok) throw new UnauthorizedError('Google sign-in failed. Please try again.');
    return profileResponse.json();
  }

  async #findOrCreateUser(profile) {
    const email = profile.email.toLowerCase();
    const linked = await this.repos.oauthAccounts.find('google', profile.sub);
    if (linked) return this.repos.users.findById(linked.userId);

    const existing = await this.repos.users.findByEmail(email);
    if (existing) {
      // An unverified local account may have been pre-registered by someone else: drop its password before linking.
      const user = existing.emailVerifiedAt ? existing : await this.repos.users.update(existing.id, { emailVerifiedAt: new Date(), passwordHash: null });
      await this.repos.oauthAccounts.link({ userId: user.id, provider: 'google', providerUserId: profile.sub, email });
      return user;
    }

    return this.uow.run(async (repos) => {
      const firstName = profile.given_name ?? email.split('@')[0];
      const user = await repos.users.create({ email, emailVerifiedAt: new Date(), firstName, lastName: profile.family_name ?? '-' });
      await this.tenants.createWithOwner(repos, { name: `${firstName}’s Tenant`, userId: user.id });
      await repos.oauthAccounts.link({ userId: user.id, provider: 'google', providerUserId: profile.sub, email });
      return user;
    });
  }
}
