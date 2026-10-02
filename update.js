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
    method: "shell.run",
    params: {
      path: "app",
      message: "pnpm build"
    }
  }, {
    method: "shell.run",
    params: {
      message: "git add -A && git commit -m 'chore: update' || true && git push"
    }
  }]
}