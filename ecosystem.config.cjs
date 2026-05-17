module.exports = {
  apps: [{
    name: 'telegram-crypto-bot',
    script: 'src/index.js',
    node_args: '--experimental-modules',
    env: {
      NODE_ENV: 'production',
    },
    error_file: 'logs/pm2-error.log',
    out_file: 'logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    max_restarts: 10,
    restart_delay: 5000,
    max_memory_restart: '500M',
  }]
};