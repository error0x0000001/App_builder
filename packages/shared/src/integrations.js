import { z } from 'zod';

/**
 * Integrations: outside services a workspace connects with its own credentials. One registry describes every provider — what it is,
 * which fields it needs, which are secret — and both the API (validation, what is encrypted) and the UI (the form) are generated from it.
 * Add a provider = one entry here + one `test` in backend/src/modules/integrations/testers.js.
 *
 * `live: true`  = something in Cloudbase already uses it once it is connected and enabled.
 * `live: false` = it can be connected and tested, but no feature consumes it yet (the UI says so; nothing pretends otherwise).
 */
export const INTEGRATION_CATEGORIES = Object.freeze([
  { id: 'email', label: 'Email', description: 'Send invitations, codes and automation email from your own domain.', icon: 'mail', color: 'blue' },
  { id: 'storage', label: 'Storage', description: 'Keep files in your own bucket or media account.', icon: 'database', color: 'orange' },
  { id: 'maps', label: 'Maps', description: 'Show locations on a map and search addresses.', icon: 'globe', color: 'teal' },
  { id: 'messaging', label: 'Messaging', description: 'Send notifications to the tools your team already uses.', icon: 'chat', color: 'purple' },
]);

const text = (key, label, extra = {}) => ({ key, label, type: 'text', ...extra });
const secret = (key, label, extra = {}) => ({ key, label, type: 'secret', required: true, ...extra });
const select = (key, label, options, extra = {}) => ({ key, label, type: 'select', options, ...extra });

const FROM = [text('from_email', 'From address', { required: true, kind: 'email', placeholder: 'noreply@yourcompany.com', hint: 'Must be an address your provider lets you send from.' }), text('from_name', 'From name', { placeholder: 'Your Company' })];
const AWS_REGIONS = ['us-east-1', 'us-east-2', 'us-west-1', 'us-west-2', 'ca-central-1', 'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-central-1', 'eu-north-1', 'eu-south-1', 'ap-south-1', 'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1', 'ap-northeast-2', 'sa-east-1', 'me-south-1', 'af-south-1'];
const S3_FIELDS = [
  text('bucket', 'Bucket', { required: true, placeholder: 'my-company-files' }),
  text('region', 'Region', { required: true, placeholder: 'us-east-1' }),
  text('access_key_id', 'Access key ID', { required: true }),
  secret('secret_access_key', 'Secret access key'),
  text('prefix', 'Folder prefix', { placeholder: 'cloudbase/', hint: 'Optional. Everything is stored under this path.' }),
];

export const INTEGRATIONS = Object.freeze([
  {
    key: 'smtp', tile: 'SMTP', category: 'email', name: 'SMTP', hue: 'blue', live: true,
    description: 'Send through any mail server: Hostinger, Zoho, Google Workspace, Microsoft 365, your own.',
    uses: ['Invitations and sign-in codes for this workspace', 'Automation, workflow and approval email', 'Test emails from Email settings'],
    fields: [
      text('host', 'Server', { required: true, kind: 'host', placeholder: 'smtp.hostinger.com' }),
      { key: 'port', label: 'Port', type: 'number', required: true, default: 587, min: 1, max: 65535 },
      select('security', 'Security', [{ value: 'starttls', label: 'STARTTLS (587)' }, { value: 'ssl', label: 'SSL / TLS (465)' }, { value: 'none', label: 'None (25)' }], { default: 'starttls' }),
      text('username', 'Username', { required: true }),
      secret('password', 'Password'),
      ...FROM,
    ],
  },
  {
    key: 'ses', tile: 'SES', category: 'email', name: 'Amazon SES', hue: 'orange', live: true,
    description: 'Amazon Simple Email Service through its SMTP interface. Use the SMTP credentials from the SES console, not your AWS keys.',
    uses: ['Invitations and sign-in codes for this workspace', 'Automation, workflow and approval email', 'High-volume sending at SES prices'],
    fields: [
      select('region', 'SES region', AWS_REGIONS, { required: true, default: 'us-east-1' }),
      text('username', 'SMTP username', { required: true, placeholder: 'AKIA…' }),
      secret('password', 'SMTP password'),
      ...FROM,
    ],
  },
  {
    key: 's3', tile: 'S3', category: 'storage', name: 'Amazon S3', hue: 'orange', live: false,
    description: 'Store files in an S3 bucket you own.',
    uses: ['Documents and chat attachments'],
    fields: S3_FIELDS,
  },
  {
    key: 'minio', tile: 'Mi', category: 'storage', name: 'MinIO / S3-compatible', hue: 'pink', live: false,
    description: 'MinIO, Cloudflare R2, DigitalOcean Spaces, Wasabi, Backblaze B2 — anything that speaks the S3 API.',
    uses: ['Documents and chat attachments'],
    fields: [text('endpoint', 'Endpoint URL', { required: true, kind: 'url', placeholder: 'https://minio.yourcompany.com' }), ...S3_FIELDS, select('path_style', 'Addressing', [{ value: 'path', label: 'Path style (MinIO)' }, { value: 'virtual', label: 'Virtual host style' }], { default: 'path' })],
  },
  {
    key: 'azure_blob', tile: 'Az', category: 'storage', name: 'Azure Blob Storage', hue: 'blue', live: false,
    description: 'Store files in an Azure storage account container.',
    uses: ['Documents and chat attachments'],
    fields: [
      text('account_name', 'Storage account', { required: true, placeholder: 'mycompanystorage' }),
      secret('account_key', 'Account key'),
      text('container', 'Container', { required: true, placeholder: 'cloudbase' }),
      text('endpoint_suffix', 'Endpoint suffix', { default: 'core.windows.net', placeholder: 'core.windows.net', hint: 'Only change for sovereign clouds.' }),
    ],
  },
  {
    key: 'cloudinary', tile: 'Cl', category: 'storage', name: 'Cloudinary', hue: 'indigo', live: false,
    description: 'Images and video with on-the-fly resizing and delivery through Cloudinary.',
    uses: ['Image and media attachments'],
    fields: [text('cloud_name', 'Cloud name', { required: true }), text('api_key', 'API key', { required: true }), secret('api_secret', 'API secret'), text('folder', 'Folder', { placeholder: 'cloudbase' })],
  },
  {
    key: 'openstreetmap', tile: 'OSM', category: 'maps', name: 'OpenStreetMap (vector)', hue: 'teal', live: false,
    description: 'Free vector maps from OpenStreetMap data. No account or key; bring your own style server for heavy use.',
    uses: ['Map on location fields', 'Address search'],
    fields: [
      text('style_url', 'Map style URL', { required: true, kind: 'url', default: 'https://tiles.openfreemap.org/styles/liberty', hint: 'A MapLibre style.json. The default is the public OpenFreeMap style.' }),
      text('geocoder_url', 'Geocoder URL', { kind: 'url', default: 'https://nominatim.openstreetmap.org', hint: 'Nominatim-compatible. The public server is for light use only.' }),
      text('contact_email', 'Contact email', { required: true, kind: 'email', hint: 'Sent as the User-Agent contact, as OpenStreetMap’s usage policy asks.' }),
    ],
  },
  {
    key: 'maptiler', tile: 'MT', category: 'maps', name: 'MapTiler', hue: 'purple', live: false,
    description: 'Hosted vector maps and geocoding from MapTiler.',
    uses: ['Map on location fields', 'Address search'],
    fields: [secret('api_key', 'API key'), select('style', 'Style', [{ value: 'streets-v2', label: 'Streets' }, { value: 'basic-v2', label: 'Basic' }, { value: 'bright-v2', label: 'Bright' }, { value: 'dataviz', label: 'Data viz' }, { value: 'satellite', label: 'Satellite' }], { default: 'streets-v2' })],
  },
  {
    key: 'google_maps', tile: 'G', category: 'maps', name: 'Google Maps', hue: 'success', live: false,
    description: 'Google Maps Platform for maps, address autocomplete and geocoding.',
    uses: ['Map on location fields', 'Address search'],
    fields: [secret('api_key', 'API key', { hint: 'Enable the Maps JavaScript and Geocoding APIs for this key.' }), text('map_id', 'Map ID', { placeholder: 'Optional' })],
  },
  {
    key: 'slack', tile: '#', category: 'messaging', name: 'Slack', hue: 'pink', live: false,
    description: 'Post workspace notifications to a Slack channel through an incoming webhook.',
    uses: ['Automation alerts to a channel'],
    fields: [secret('webhook_url', 'Incoming webhook URL', { kind: 'url', hint: 'Create it in Slack under Apps › Incoming Webhooks.' })],
  },
]);

export const getIntegration = (key) => INTEGRATIONS.find((i) => i.key === key) ?? null;
export const secretFieldKeys = (key) => (getIntegration(key)?.fields ?? []).filter((f) => f.type === 'secret').map((f) => f.key);
export const publicFieldKeys = (key) => (getIntegration(key)?.fields ?? []).filter((f) => f.type !== 'secret').map((f) => f.key);

const HOST = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/i;
function fieldSchema(field) {
  const label = field.label;
  let base;
  if (field.type === 'number') base = z.coerce.number({ invalid_type_error: `${label} must be a number` }).int().min(field.min ?? 0).max(field.max ?? 1_000_000);
  else if (field.type === 'select') base = z.enum(field.options.map((o) => (typeof o === 'string' ? o : o.value)));
  else if (field.kind === 'email') base = z.string().trim().email(`${label} must be an email address`).max(200);
  else if (field.kind === 'url') base = z.string().trim().url(`${label} must be a full URL`).max(500).refine((v) => /^https?:\/\//i.test(v), `${label} must start with http:// or https://`);
  else if (field.kind === 'host') base = z.string().trim().regex(HOST, `${label} must be a host name like smtp.example.com`);
  else base = z.string().trim().max(500);
  return base;
}

/**
 * Validation for one provider, built from its fields. `config` holds the plain fields (required ones must be present), `secrets` holds the secret
 * fields; every secret is optional on update (leave it out to keep the stored value) — the service checks that required secrets exist after merging.
 */
export function integrationBodySchema(key) {
  const def = getIntegration(key);
  if (!def) return null;
  const config = {}; const secrets = {};
  for (const field of def.fields) {
    const schema = fieldSchema(field);
    if (field.type === 'secret') secrets[field.key] = schema.optional();
    else config[field.key] = field.required ? schema : schema.optional().or(z.literal('').transform(() => undefined));
  }
  return z.object({ config: z.object(config).strict(), secrets: z.object(secrets).strict().optional() });
}
export const integrationEnableSchema = z.object({ enabled: z.boolean() });
