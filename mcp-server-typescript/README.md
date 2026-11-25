# A Simple MCP health-metrics Server written in TypeScript

A health-metrics MCP server that serves its tools over SSE. It accompanies the [Quickstart](https://modelcontextprotocol.io/quickstart) tutorial.

## Setup

Requires Node.js 18 or newer and npm. From this directory:

```bash
npm install
npm run build
node build/index.js
```

The server listens on port `3001`; the MCP SSE endpoint is `http://localhost:3001/sse`. Keep it running while you use a client.
