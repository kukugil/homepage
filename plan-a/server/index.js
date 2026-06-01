const app = require('./app');
const CONFIG = require('./config');

const port = parseInt(process.env.PORT, 10) || 3001;
const server = app.listen(port, '0.0.0.0', () => {
  console.log('E-Reader server running on http://0.0.0.0:' + port);
  console.log('Storage:', CONFIG.DL_DIR);
});
server.keepAliveTimeout = 120000;
server.headersTimeout = 120000;

function gracefulShutdown(signal) {
  console.log('Received ' + signal + ', shutting down...');
  server.close(() => {
    require('./db').closeDb();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('exit', (code) => {
  console.log('Process exited with code:', code);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err.message, err.stack);
  gracefulShutdown('uncaughtException');
});
