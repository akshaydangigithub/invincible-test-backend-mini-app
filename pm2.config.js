module.exports = {
  apps: [
    {
      name: "my-bot",
      script: "src/bot.ts",
      interpreter: "./node_modules/.bin/ts-node",
      interpreter_args: "-r tsconfig-paths/register",
      watch: false,
    },
  ],
};
