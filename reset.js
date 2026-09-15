module.exports = {
  run: [{
    method: "fs.rm",
    params: {
      path: "app"
    }
  }, {
    method: "notify",
    params: {
      html: "Run the 'install' tab to reinstall tscaps from scratch."
    }
  }]
}