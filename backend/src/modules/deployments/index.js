import { config } from '../../shared/config.js';
import { QUEUES } from '../../shared/queue.js';
import { DeploymentsService } from './deployments.service.js';
import { TerminalHub } from './terminal.js';
import { LocalRunner, RunnerError, SshRunner } from './runner.js';

/** Which runner talks to a server: SSH to the machine the organisation connected, or the API's own machine when the install allows it. */
export function defaultRunnerFactory(server) {
  if (!server || server.kind === 'local') {
    if (!config.DEPLOYMENTS_ALLOW_LOCAL) { if (server) throw new RunnerError('Running on this machine is turned off (DEPLOYMENTS_ALLOW_LOCAL).'); return null; }
    return new LocalRunner();
  }
  return new SshRunner({ host: server.host, port: server.port, username: server.username, privateKey: server.privateKey, hostKey: server.hostKey }, { allowPrivate: config.INTEGRATIONS_ALLOW_PRIVATE_HOSTS, onHostKey: server.onHostKey });
}

/** Returns null when DEPLOYMENTS_ENABLED=false: nothing is constructed, routed, scheduled or shown. */
export function createDeployments({ enabled, runnerFactory = defaultRunnerFactory, ...deps }) {
  if (!enabled) return null;
  return new DeploymentsService({ ...deps, queues: QUEUES, appUrl: config.APP_URL, runnerFactory });
}

export const createTerminals = ({ deployments, ...deps }) => (deployments ? new TerminalHub({ deployments, ...deps }) : null);
