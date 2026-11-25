# An LLM-Powered Chatbot MCP Client written in TypeScript

An OpenAI-powered chatbot MCP client that connects to the SSE server configured in [`mcp-server-config.js`](./mcp-server-config.js). It accompanies the [Building MCP clients](https://modelcontextprotocol.io/tutorials/building-a-client) tutorial.

## Setup

Requires Node.js 18 or newer, npm and an OpenAI API key. From this directory:

```bash
npm install
npm run build
export OPENAI_API_KEY=sk-...
node build/index.js
```

The client connects to the server at `http://localhost:3001/sse`, so start the server first. Type a query at the `Query:` prompt and enter `quit` to exit.
