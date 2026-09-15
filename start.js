module.exports = {
  daemon: true,
  run: [
    {
      method: "shell.run",
      params: {
        path: "app",
        message: [
          "pnpm --filter ./apps/studio dev"
        ],
        on: [{
          "event": "/(http:\\/\\/\\S+)/",
          "done": true
        }]
      }
    },
    {
      method: "local.set",
      params: {
        url: "{{input.event[1]}}"
      }
    },
    {
      method: "uri.open",
      params: {
        uri: "{{input.event[1]}}"
      }
    }
  ]
}