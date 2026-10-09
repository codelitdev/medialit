# @medialit/integration-tests

## 0.2.0

### Minor Changes

- 439c225: The MCP suite checks that `get_total_storage` and `whoami` report the storage limit set in `MEDIALIT_EXPECTED_MAX_STORAGE`, when it is set.
- 6823164: Publish the REST, MCP and CLI integration tests as `@medialit/integration-tests`, with a `synthetic` command that checks a MediaLit server end to end and can ping a heartbeat monitor.
