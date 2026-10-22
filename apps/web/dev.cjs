// Official Next.js custom-server API avoids the CLI process supervisor.
// This is a development launcher only; production uses `next start`.
process.env.NODE_ENV = 'development';
process.env.NEXT_TELEMETRY_DISABLED = '1';
const { createServer } = require('node:http');
const next = require('next');
const port = Number(process.env.PORT || 3000);
const hostname = '127.0.0.1';
const app = next({ dev: true, hostname, port });
app
  .prepare()
  .then(() => {
    const server = createServer(app.getRequestHandler());
    server.on('upgrade', app.getUpgradeHandler());
    server.listen(port, hostname, () =>
      console.log(`AI Code Video Studio ready at http://${hostname}:${port}`),
    );
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
