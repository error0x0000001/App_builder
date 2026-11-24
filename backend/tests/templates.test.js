import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parse as parseYaml } from 'yaml';
import { catalog, describeTemplate, findTemplate, listTemplates, renderTemplate } from '../src/modules/deployments/templates/engine.js';

describe('template catalog', () => {
  it('ships the full open-source catalog with logos and metadata', () => {
    const list = listTemplates();
    assert.ok(list.length >= 600, `only ${list.length} templates`);
    assert.ok(list.every((t) => t.id && t.name && Array.isArray(t.tags)));
    assert.equal(new Set(list.map((t) => t.id)).size, list.length, 'ids are unique');
    assert.ok(list.filter((t) => t.logo).length > list.length * 0.95);
  });

  it('renders every template: valid Compose, domains that point at real services, no placeholder left behind', () => {
    const failures = [];
    for (const t of catalog()) {
      try {
        const r = renderTemplate(t, { domain: 'app.example.com' });
        const doc = parseYaml(r.compose);
        for (const d of r.domains) { assert.ok(d.port > 0 && d.port < 65536, `port ${d.port}`); assert.match(d.host, /^[a-z0-9.-]+$/i, `host ${d.host}`); assert.ok(d.serviceName in doc.services); }
        const left = [r.env, ...r.mounts.map((m) => m.content), ...r.domains.map((d) => d.host)].join('\n').match(/\$\{(domain|password|hash|base64|uuid|email|username|randomPort|timestamp\w*)(:[^}]*)?\}/);
        assert.equal(left, null, `unresolved placeholder ${left?.[0]}`);
      } catch (e) { failures.push(`${t.id}: ${e.message}`); }
    }
    assert.deepEqual(failures, []);
  });

  it('generates secrets of the requested shape, distinct hosts, and signed JWTs', () => {
    const t = { toml: '[variables]\nmain_domain = "${domain}"\napi_domain = "${domain}"\npw = "${password:20}"\nhx = "${hash:40}"\nsecret = "${password:32}"\nanon_payload = \'{"role":"anon"}\'\nanon = "${jwt:secret:anon_payload}"\n[config]\nenv = ["A=${pw}", "H=${hx}", "J=${anon}", "ID=${uuid}", "P=${randomPort}", "M=${email}"]\n[[config.domains]]\nserviceName = "web"\nport = 80\nhost = "${main_domain}"\n[[config.domains]]\nserviceName = "web"\nport = 81\nhost = "${api_domain}"\n[[config.mounts]]\nfilePath = "/conf/app.cfg"\ncontent = "host=${main_domain}"\n', compose: 'services:\n  web:\n    image: nginx\n' };
    const r = renderTemplate(t, { domain: 'site.example.com', mailDomain: 'site.example.com' });
    const env = Object.fromEntries(r.env.split('\n').map((l) => l.split(/=(.*)/s).slice(0, 2)));
    assert.match(env.A, /^[A-Za-z0-9]{20}$/); assert.match(env.H, /^[0-9a-f]{40}$/); assert.match(env.ID, /^[0-9a-f-]{36}$/);
    assert.ok(Number(env.P) >= 30000 && Number(env.P) < 60000); assert.match(env.M, /@site\.example\.com$/);
    assert.deepEqual(r.domains.map((d) => d.host), ['site.example.com', 'api-domain.site.example.com']);
    assert.equal(r.mounts[0].content, 'host=site.example.com'); assert.equal(r.mounts[0].path, 'conf/app.cfg');
    const [h, b, s] = env.J.split('.');
    assert.deepEqual(JSON.parse(Buffer.from(b, 'base64url')), { role: 'anon' });
    assert.ok(h && s);
    assert.notEqual(renderTemplate(t, { domain: 'x.com' }).env, renderTemplate(t, { domain: 'x.com' }).env, 'secrets differ per deployment');
  });

  it('describes a template and refuses unsafe or broken ones', () => {
    const d = describeTemplate(findTemplate('ghost'));
    assert.deepEqual(d.services, ['ghost', 'db'].filter((s) => d.services.includes(s)));
    assert.ok(d.domains.length >= 1);
    assert.throws(() => renderTemplate({ toml: '[config]\n[[config.mounts]]\nfilePath = "/../../etc/passwd"\ncontent = "x"\n', compose: 'services:\n  a:\n    image: x\n' }, { domain: 'a.com' }), /Unsafe/);
    assert.throws(() => renderTemplate({ toml: '[[config.domains]]\nserviceName = "nope"\nport = 80\nhost = "a.com"\n', compose: 'services:\n  a:\n    image: x\n' }, { domain: 'a.com' }), /unknown service/);
  });
});
