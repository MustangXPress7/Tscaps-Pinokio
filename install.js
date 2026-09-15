module.exports = {
  run: [
    {
      method: "shell.run",
      params: {
        message: [
          "git clone https://github.com/francozanardi/tscaps app",
        ]
      }
    },
    {
      method: "shell.run",
      params: {
        path: "app",
        message: [
          "pnpm install"
        ],
      }
    },
    {
      method: "notify",
      params: {
        html: "Click the 'start' tab to launch tscaps!"
      }
    }
  ]
}