import { del, get, patch, post, qs } from './http.js';

export { download } from './http.js';

export const authApi = {
  config: () => get('/auth/config'),
  signup: (body) => post('/auth/signup', body),
  verifyEmail: (body) => post('/auth/verify-email', body),
  resendVerification: (body) => post('/auth/resend-verification', body),
  login: (body) => post('/auth/login', body),
  mfaChallenge: (body) => post('/auth/mfa/challenge', body),
  logout: () => post('/auth/logout'),
  logoutAll: () => post('/auth/logout-all'),
  forgotPassword: (body) => post('/auth/password/forgot', body),
  resetPassword: (body) => post('/auth/password/reset', body),
};

export const meApi = {
  get: () => get('/me'),
  updateProfile: (body) => patch('/me', body),
  updatePreferences: (body) => patch('/me/preferences', body),
  changePassword: (body) => post('/me/password', body),
  sessions: () => get('/me/sessions'),
  revokeSession: (id) => del(`/me/sessions/${id}`),
  activity: ({ after } = {}) => get(`/me/activity${qs({ limit: 10, after })}`),
  mfaStatus: () => get('/me/mfa'),
  mfaSetup: () => post('/me/mfa/setup'),
  mfaEnable: (body) => post('/me/mfa/enable', body),
  mfaDisable: (body) => post('/me/mfa/disable', body),
  mfaRecoveryCodes: (body) => post('/me/mfa/recovery-codes', body),
};

export const workspacesApi = {
  lookup: (workspace) => get(`/workspaces/lookup${qs({ workspace })}`),
  create: (body) => post('/workspaces', body),
  switch: (id) => post(`/workspaces/${id}/switch`),
  updateTheme: (id, theme) => patch(`/workspaces/${id}/theme`, { theme }),
  updateUi: (id, body) => patch(`/workspaces/${id}/ui`, body),
  completeOnboarding: (id, body) => patch(`/workspaces/${id}/onboarding`, body),
  members: (id, { after } = {}) => get(`/workspaces/${id}/members${qs({ limit: 20, after })}`),
  changeRole: (id, userId, role) => patch(`/workspaces/${id}/members/${userId}`, { role }),
  removeMember: (id, userId) => del(`/workspaces/${id}/members/${userId}`),
  loginAs: (id, userId) => post(`/workspaces/${id}/members/${userId}/login-as`),
  invitations: (id) => get(`/workspaces/${id}/invitations`),
  invite: (id, invitations) => post(`/workspaces/${id}/invitations`, { invitations }),
  resendInvitation: (id, invitationId) => post(`/workspaces/${id}/invitations/${invitationId}/resend`),
  revokeInvitation: (id, invitationId) => del(`/workspaces/${id}/invitations/${invitationId}`),
};

export const invitationsApi = {
  preview: (token) => get(`/invitations/preview${qs({ token })}`),
  accept: (body) => post('/invitations/accept', body),
};

const page = (key, rest = '') => `/setup/pages/${key}${rest}`;
export const setupApi = {
  tree: () => get('/setup/tree'),
  page: (key) => get(page(key)),
  settings: (key) => get(page(key, '/settings')),
  saveSettings: (key, version, values) => patch(page(key, '/settings'), { version, values }),
  records: (key, { after, q, view, parent, total } = {}) => get(`${page(key, '/records')}${qs({ limit: 80, after, q, view, parent, total: total ? 'true' : undefined })}`),
  createRecord: (key, body) => post(page(key, '/records'), body),
  updateRecord: (key, id, body) => patch(page(key, `/records/${id}`), body),
  deleteRecords: (key, ids) => post(page(key, '/records/delete'), { ids }),
  hierarchy: (key) => get(page(key, '/tree')),
  metrics: (key) => get(page(key, '/metrics')),
  fixHealth: (key) => post(page(key, '/fix')),
  run: (key, body) => post(page(key, '/run'), body),
};

export const objectsApi = {
  definition: (object) => get(`/objects/${object}`),
  records: (object, { after, q } = {}) => get(`/objects/${object}/records${qs({ limit: 80, after, q })}`),
  create: (object, body) => post(`/objects/${object}/records`, body),
  update: (object, id, body) => patch(`/objects/${object}/records/${id}`, body),
  remove: (object, ids) => post(`/objects/${object}/records/delete`, { ids }),
  decide: (object, id, body) => post(`/objects/${object}/records/${id}/approval`, body),
};
