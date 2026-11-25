import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { Client } from 'ssh2';
import { resolveTarget } from '../../shared/net/safeRequest.js';

/**
 * Runs shell commands on a server and streams the output. Two real runners — SSH to a machine the organisation connected, and the API's own
 * machine (only when DEPLOYMENTS_ALLOW_LOCAL is on) — and tests pass a fake one. Interface: `run(command, { onData, signal, timeoutMs })`
 * resolves `{ code, output }`; it never rejects for a non-zero exit, only for a failure to connect or run.
 */
export class RunnerError extends Error {}

const fingerprintOf = (key) => `SHA256:${crypto.createHash('sha256').update(key).digest('base64').replace(/=+$/, '')}`;

export class SshRunner {
  /** `server`: { host, port, username, privateKey, hostKey }. `onHostKey(fingerprint)` is called on first contact to remember it. */
  constructor(server, { allowPrivate = false, onHostKey } = {}) { Object.assign(this, { server, allowPrivate, onHostKey }); }

  async run(command, { onData, signal, timeoutMs = 30 * 60_000 } = {}) {
    const { host, port, username, privateKey, hostKey } = this.server;
    const target = await resolveTarget(host, { allowPrivate: this.allowPrivate }).catch((e) => { throw new RunnerError(e.message); });
    return new Promise((resolve, reject) => {
      const conn = new Client();
      let output = ''; let done = false; let seen;
      const finish = (fn, value) => { if (done) return; done = true; clearTimeout(timer); conn.end(); fn(value); };
      const timer = setTimeout(() => finish(reject, new RunnerError(`The command did not finish in ${Math.round(timeoutMs / 1000)} s`)), timeoutMs);
      signal?.addEventListener('abort', () => finish(reject, new RunnerError('Cancelled')));
      conn.on('ready', () => {
        conn.exec('bash -ls', (error, stream) => { // the script goes in on stdin, so no quoting of it can go wrong
          if (error) return finish(reject, new RunnerError(error.message));
          const take = (chunk) => { const text = chunk.toString('utf8'); output += text; onData?.(text); };
          stream.on('data', take); stream.stderr.on('data', take);
          stream.on('close', (code) => finish(resolve, { code: code ?? 0, output, hostKey: seen }));
          stream.end(`${command}\n`);
          return undefined;
        });
      });
      conn.on('error', (error) => finish(reject, new RunnerError(error.level === 'client-authentication' ? 'The server rejected the SSH key' : error.message)));
      conn.connect({
        host: target.address, port, username, privateKey, readyTimeout: 20_000, keepaliveInterval: 15_000, keepaliveCountMax: 8,
        hostVerifier: (key) => {
          seen = fingerprintOf(key);
          if (hostKey && hostKey !== seen) { finish(reject, new RunnerError(`The server's SSH host key changed (${seen}). Remove and re-add the server if that is expected.`)); return false; }
          if (!hostKey) this.onHostKey?.(seen);
          return true;
        },
      });
    });
  }
}

/** Same as run() but with a terminal attached: returns { write, resize, close }; `onData` gets output, `onClose` fires once when the session ends. */
SshRunner.prototype.interactive = async function interactive(command, { cols = 80, rows = 24, onData, onClose } = {}) {
  const { host, port, username, privateKey, hostKey } = this.server;
  const target = await resolveTarget(host, { allowPrivate: this.allowPrivate }).catch((e) => { throw new RunnerError(e.message); });
  return new Promise((resolve, reject) => {
    const conn = new Client(); let stream; let ended = false; let seen;
    const end = (reason) => { if (ended) return; ended = true; conn.end(); onClose?.(reason); };
    conn.on('ready', () => {
      conn.exec(command, { pty: { cols, rows, term: 'xterm-256color' } }, (error, s) => {
        if (error) { conn.end(); return reject(new RunnerError(error.message)); }
        stream = s; s.on('data', (c) => onData?.(c.toString('utf8'))); s.stderr.on('data', (c) => onData?.(c.toString('utf8'))); s.on('close', () => end('exit'));
        return resolve({ write: (d) => stream.write(d), resize: (c, r) => stream.setWindow(r, c, 0, 0), close: () => { try { stream.close(); } catch { /* already closed */ } end('closed'); } });
      });
    });
    conn.on('error', (error) => { if (!stream) reject(new RunnerError(error.level === 'client-authentication' ? 'The server rejected the SSH key' : error.message)); else end('error'); });
    conn.connect({
      host: target.address, port, username, privateKey, readyTimeout: 20_000, keepaliveInterval: 15_000,
      hostVerifier: (key) => { seen = fingerprintOf(key); if (hostKey && hostKey !== seen) { reject(new RunnerError('The server’s SSH host key changed.')); return false; } if (!hostKey) this.onHostKey?.(seen); return true; },
    });
  });
};

export class LocalRunner {
  run(command, { onData, signal, timeoutMs = 30 * 60_000 } = {}) {
    return new Promise((resolve, reject) => {
      const child = spawn('bash', ['-lc', command], { stdio: ['ignore', 'pipe', 'pipe'], signal });
      let output = '';
      const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new RunnerError('The command timed out')); }, timeoutMs);
      const take = (chunk) => { const t = chunk.toString('utf8'); output += t; onData?.(t); };
      child.stdout.on('data', take); child.stderr.on('data', take);
      child.on('error', (e) => { clearTimeout(timer); reject(new RunnerError(e.message)); });
      child.on('close', (code) => { clearTimeout(timer); resolve({ code: code ?? 0, output }); });
    });
  }
}

/** Scripted runner for tests: records every command and answers from `respond(command)` (default: success, no output). */
export class FakeRunner {
  constructor(respond = () => ({ code: 0, output: '' })) { this.respond = respond; this.commands = []; }

  async run(command, { onData } = {}) {
    this.commands.push(command);
    const r = (await this.respond(command)) ?? { code: 0, output: '' };
    if (r.output) onData?.(r.output);
    return { code: r.code ?? 0, output: r.output ?? '' };
  }

  /** Records the command and echoes what is typed, so the socket layer can be tested without a server. */
  async interactive(command, { onData, onClose } = {}) {
    this.commands.push(command); this.sessions = (this.sessions ?? 0) + 1;
    let open = true;
    return { write: (d) => open && onData?.(`echo:${d}`), resize: (c, r) => { this.lastSize = [c, r]; }, close: () => { if (open) { open = false; onClose?.('closed'); } } };
  }
}
