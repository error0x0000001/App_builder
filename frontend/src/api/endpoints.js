import { del, get, patch, post, qs, request, upload } from './http.js';

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

export const searchApi = {
  search: (q, type, signal) => get(`/search${qs({ q, type })}`, { signal }),
};

export const objectsApi = {
  definition: (object) => get(`/objects/${object}`),
  get: (object, id) => get(`/objects/${object}/records/${id}`),
  records: (object, { after, q } = {}) => get(`/objects/${object}/records${qs({ limit: 80, after, q })}`),
  create: (object, body) => post(`/objects/${object}/records`, body),
  update: (object, id, body) => patch(`/objects/${object}/records/${id}`, body),
  remove: (object, ids) => post(`/objects/${object}/records/delete`, { ids }),
  decide: (object, id, body) => post(`/objects/${object}/records/${id}/approval`, body),
};

const put = (path, body) => request(path, { method: 'PUT', body });
const form = (file, fields = {}) => { const data = new FormData(); for (const [k, v] of Object.entries(fields)) data.append(k, v); data.append('file', file, file.name); return data; }; // fields first: the server streams the file part

/** Documents (the Drive) and record attachments. */
export const driveApi = {
  usage: () => get('/drive/usage'),
  list: (params, options) => get(`/drive/list${qs(params)}`, options),
  createFolder: (name, parentId) => post('/drive/folders', { name, parentId: parentId ?? null }),
  patchFolder: (id, body) => patch(`/drive/folders/${id}`, body),
  access: (id) => get(`/drive/folders/${id}/access`),
  setAccess: (id, body) => put(`/drive/folders/${id}/access`, body),
  file: (id) => get(`/drive/files/${id}`),
  patchFile: (id, body) => patch(`/drive/files/${id}`, body),
  copyFile: (id, body = {}) => post(`/drive/files/${id}/copy`, body),
  link: (id) => get(`/drive/files/${id}/link`),
  trash: (type, id) => post('/drive/trash', { type, id }),
  restore: (type, id) => post('/drive/restore', { type, id }),
  deleteForever: (type, id) => post('/drive/delete-forever', { type, id }),
  star: (type, id, starred) => put('/drive/stars', { type, id, starred }),
  upload: (folderId, file, options) => upload('/drive/files', form(file, { folderId }), options),
  recordFiles: (object, id) => get(`/drive/records/${object}/${id}/files`),
  uploadRecordFile: (object, id, file, options) => upload(`/drive/records/${object}/${id}/files`, form(file), options),
};

export const peopleApi = { search: (q) => get(`/people${qs({ q })}`) };

export const chatApi = {
  inbox: ({ archived } = {}) => get(`/chat/conversations${qs({ archived: archived ? '1' : undefined, limit: 100 })}`),
  unread: () => get('/chat/unread'),
  conversation: (id) => get(`/chat/conversations/${id}`),
  openDm: (userId) => post('/chat/dm', { userId }),
  createGroup: (body) => post('/chat/groups', body),
  update: (id, body) => patch(`/chat/conversations/${id}`, body),
  setState: (id, body) => patch(`/chat/conversations/${id}/state`, body),
  setLegalHold: (id, on) => request(`/chat/conversations/${id}/legal-hold`, { method: 'PUT', body: { on } }),
  createInvite: (id) => post(`/chat/conversations/${id}/invite`),
  revokeInvite: (id) => del(`/chat/conversations/${id}/invite`),
  join: (code) => post(`/chat/join/${code}`),
  addMembers: (id, userIds) => post(`/chat/conversations/${id}/members`, { userIds }),
  setRole: (id, userId, role) => request(`/chat/conversations/${id}/members/${userId}`, { method: 'PUT', body: { role } }),
  removeMember: (id, userId) => del(`/chat/conversations/${id}/members/${userId}`),
  messages: (id, { before } = {}) => get(`/chat/conversations/${id}/messages${qs({ before, limit: 50 })}`),
  send: (id, body) => post(`/chat/conversations/${id}/messages`, body),
  edit: (id, messageId, body) => patch(`/chat/conversations/${id}/messages/${messageId}`, { body }),
  remove: (id, messageId) => del(`/chat/conversations/${id}/messages/${messageId}`),
  react: (id, messageId, emoji) => request(`/chat/conversations/${id}/messages/${messageId}/reactions`, { method: 'PUT', body: { emoji } }),
  pin: (id, messageId) => request(`/chat/conversations/${id}/messages/${messageId}/pin`, { method: 'PUT', body: {} }),
  pins: (id) => get(`/chat/conversations/${id}/pins`),
  markRead: (id, messageId) => post(`/chat/conversations/${id}/read`, { messageId }),
  search: (q, conversationId) => get(`/chat/search${qs({ q, conversationId })}`),
  presence: (ids) => get(`/chat/presence${qs({ ids: ids.join(',') })}`),
  config: () => get('/chat/config'),
  startCall: (id, video) => post(`/chat/conversations/${id}/call`, { video }),
  joinCall: (id) => post(`/chat/conversations/${id}/call/join`),
  declineCall: (id) => post(`/chat/conversations/${id}/call/decline`),
  leaveCall: (id) => post(`/chat/conversations/${id}/call/leave`),
  endCall: (id) => post(`/chat/conversations/${id}/call/end`),
};
