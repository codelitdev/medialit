## Development Tips

- When adding, removing, renaming, or changing a command or flag, update `packages/integration-tests/src/cli.ts`. Keep its expected command inventory exact and exercise every command's inputs, outputs, and behavior, including cleanup for any test data. Run it against a live API when credentials and a test account are available with `bun --filter @medialit/integration-tests test:cli` (it builds the CLI first).
