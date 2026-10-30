module.exports = {
  run: [{
    method: "shell.run",
    params: {
      message: "git pull"
    }
  }, {
    method: "shell.run",
    params: {
      path: "app",
      message: "git pull"
    }
  }, {
    method: "shell.run",
    params: {
      path: "app",
      message: "pnpm install"
    }
  }, {
    method: "fs.copy",
    params: {
      src: "vite.pinokio.mts",
      dest: "app/apps/studio/vite.config.pinokio.mts"
    }
  }]
}