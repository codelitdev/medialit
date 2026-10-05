## Development Tips

- Always stick to industry standards and best practices for maintaining the REST API documentation using swagger and openapi.
- Stick to OpenAPI >=3.0.3 specification for the API documentation.
- When adding, removing, renaming, or changing an MCP tool under `src/mcp/tools`, update `packages/integration-tests/src/mcp.ts`. Keep its expected tool inventory exact and exercise every tool's inputs, outputs, and behavior, including cleanup for any test data or settings changes. Run it against a live API when credentials and a test account are available with `bun --filter @medialit/integration-tests test:mcp`.
