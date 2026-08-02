module.exports = {
  apps: [
    {
      name: "flashmail-smtp-daemon",
      script: "npx",
      args: "tsx server/smtp-daemon.ts",
      env: {
        NODE_ENV: "production",
        SMTP_PORT: "25",
        NEXT_PUBLIC_DOMAIN: "flash-mail.vaibhavs-h.xyz",
      },
    },
    {
      name: "flashmail-auto-cleaner",
      script: "npx",
      args: "tsx server/cleaner.ts",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
