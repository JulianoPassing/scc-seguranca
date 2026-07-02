require("dotenv").config();

module.exports = {
  apps: [
    {
      name: "scc-seguranca",
      script: "./index.js",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork", // Força modo fork ao invés de cluster
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
        DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN,
        ECHO_API_KEY: process.env.ECHO_API_KEY,
      },
      error_file: "./logs/pm2-error.log",
      out_file: "./logs/pm2-out.log",
      log_file: "./logs/pm2-combined.log",
      time: true,
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    },
  ],
};
