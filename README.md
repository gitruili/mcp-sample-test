**English** | [日本語](./README.ja.md)

# Quickstart Resources

A repository of servers and clients from the following Model Context Protocol tutorials:
- mcp server – a simple MCP health-metrics server using SSE
- mcp client – an LLM-powered chatbot MCP client

## Prerequisites

- [Node.js](https://nodejs.org/) 18 or newer
- npm (bundled with Node.js)

## Running the server

The health-metrics server lives in [`mcp-server-typescript`](./mcp-server-typescript):

```bash
cd mcp-server-typescript
npm install
npm run build
node build/index.js
```

The server listens on port `3001` and serves MCP over SSE at `http://localhost:3001/sse`. Leave it running while you use the client.

## Running the client

The chatbot client lives in [`mcp-client-typescript`](./mcp-client-typescript). It connects to the SSE server above, so start the server first, and it needs an OpenAI API key in the `OPENAI_API_KEY` environment variable:

```bash
cd mcp-client-typescript
npm install
npm run build
export OPENAI_API_KEY=sk-...
node build/index.js
```

Type a query at the `Query:` prompt and enter `quit` to exit.

See the README in each project directory for more details.
