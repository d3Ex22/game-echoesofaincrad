const path = require("path");
const webpackFactory = require(path.join(
  __dirname,
  "node_modules",
  "vortex-api",
  "bin",
  "webpack.js",
)).default;

module.exports = webpackFactory("index", __dirname, 5);
