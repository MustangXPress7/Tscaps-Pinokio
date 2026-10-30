module.exports = {
  daemon: true,
  run: [
    {
      method: "fs.copy",
      params: {
        src: "vite.pinokio.mts",
        dest: "app/apps/studio/vite.config.pinokio.mts"
      }
    },
    {
      method: "shell.run",
      params: {
        path: "app",
        env: {
          NO_COLOR: "1"
        },
        message: [
          "pnpm --filter ./apps/studio exec vite --config vite.config.pinokio.mts --port 5173 --strictPort"
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