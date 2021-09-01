module.exports = {
  roots: [
    "src"
  ],
  transform: {
    "^.+\\.ts$": ["@swc-node/jest"]
  },
  verbose: true
}
