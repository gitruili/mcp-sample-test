# A Simple MCP health-metrics Server written in TypeScript

A health-metrics MCP server that serves its tools and resources over SSE. It accompanies the [Quickstart](https://modelcontextprotocol.io/quickstart) tutorial.

## Prerequisites

- Node.js 18 or newer
- npm

## Setup

From this directory:

```bash
npm install
npm run build
node build/index.js
```

The server listens on port `3001` and prints:

```text
MCP server listening on http://localhost:3001/sse
```

The MCP SSE endpoint is `http://localhost:3001/sse`. Keep the server running while you use a client.

`npm run build` compiles `src/` into `build/`. Run it again after changing the source. The server reads `citta.txt` from this directory at startup, so keep that file next to `build/`.

## Health-data API

The `healthMetrics` and `getHealthImageData` tools request data from an external API at `http://43.138.239.43:8000`. The server starts without it, but those tool calls need network access to that host. If they time out, the server is running but cannot reach the API.
