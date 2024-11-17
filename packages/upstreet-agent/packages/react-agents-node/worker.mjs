import path from 'path';
import os from 'os';
import { program } from 'commander';
import { createServer as createViteServer } from 'vite';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';

//

['uncaughtException', 'unhandledRejection'].forEach(event => {
  process.on(event, err => {
    process.send({
      method: 'error',
      args: [err.stack],
    });
  });
});

//

const homeDir = os.homedir();

const loadModule = async (directory, p) => {
  const viteServer = await makeViteServer(directory);
  // console.log('get agent module 1');
  const entryModule = await viteServer.ssrLoadModule(p);
  // console.log('get agent module 2', entryModule);
  return entryModule.default;
};
const startAgentMainServer = async ({
  agentMain,
  ip,
  port,
}) => {
  // console.log('startAgentMainServer', { agentMain, ip, port });

  const app = new Hono();

  app.all('*', (c) => {
    const req = c.req.raw;
    // console.log('got fetch', {
    //   url: req.url,
    //   method: req.method,
    //   headers: Object.fromEntries(req.headers),
    // });
    return agentMain.fetch(req);
  });

  // console.log('create server', {
  //   hostname: ip,
  //   port: parseInt(port, 10),
  // });

  // create server
  const server = serve({
    fetch: app.fetch,
    // hostname: ip,
    port: parseInt(port, 10),
  });
  // wait for server to start
  await new Promise((resolve, reject) => {
    server.on('listening', () => {
      resolve(null);
    });
    server.on('error', (err) => {
      reject(err);
    });
  });
  // console.log(`Agent server listening on http://${ip}:${port}`);
};
const runAgent = async (directory, opts) => {
  const p = '/packages/upstreet-agent/packages/react-agents-node/entry.mjs';
  const main = await loadModule(directory, p);
  // console.log('worker loaded module', main);
  const agentMain = await main();
  // console.log('agentMain', agentMain);

  const {
    ip,
    port,
  } = opts;
  await startAgentMainServer({
    agentMain,
    ip,
    port,
  });

  // console.log('worker send 1');
  process.send({
    method: 'ready',
    args: [],
  });
  // console.log('worker send 2');
};
const makeViteServer = (directory) => {
  return createViteServer({
    root: directory,
    server: { middlewareMode: 'ssr' },
    cacheDir: path.join(homeDir, '.usdk', 'vite'),
    esbuild: {
      jsx: 'transform',
      // jsxFactory: 'React.createElement',
      // jsxFragment: 'React.Fragment',
    },
    optimizeDeps: {
      entries: [
        './packages/upstreet-agent/packages/react-agents-node/entry.mjs',
      ],
    },
  });
};

const main = async () => {
  let commandExecuted = false;

  program
    .command('run')
    .description('Run the agent')
    .argument(`[directory]`, `Agent directory`)
    .option('--var <vars...>', 'Environment variables in format KEY:VALUE')
    .requiredOption('--ip <ip>', 'IP address to bind to')
    .requiredOption('--port <port>', 'Port to bind to')
    .action(async (directory, opts) => {
      commandExecuted = true;

      try {
        await runAgent(directory, opts);
      } catch (err) {
        console.warn(err);
        process.exit(1);
      }
    });

  await program.parseAsync();

  if (!commandExecuted) {
    console.error('Command missing');
    process.exit(1);
  }
};
main().catch(err => {
  console.error(err);
  process.exit(1);
});
