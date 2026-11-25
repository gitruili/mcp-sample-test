# An LLM-Powered Chatbot MCP Client written in TypeScript

An OpenAI-powered chatbot MCP client that connects to the SSE server configured in [`mcp-server-config.js`](./mcp-server-config.js). It accompanies the [Building MCP clients](https://modelcontextprotocol.io/tutorials/building-a-client) tutorial.

## Prerequisites

- Node.js 18 or newer
- npm
- An OpenAI API key
- The health-metrics server running at `http://localhost:3001/sse`

## Setup

1. Install the dependencies and build the client:

   ```bash
   npm install
   npm run build
   ```

2. Configure the API key. Either create a `.env` file from the template and fill it in:

   ```bash
   cp .env.example .env
   # then edit .env and set OPENAI_API_KEY=sk-...
   ```

   Or export the key in the current shell:

   ```bash
   export OPENAI_API_KEY=sk-...
   ```

   The client reads `.env` from this directory. It exits with an error if `OPENAI_API_KEY` is not set.

3. Start the server first (see [`../mcp-server-typescript`](../mcp-server-typescript)), then start the client:

   ```bash
   node build/index.js
   ```

The client connects to the server at `http://localhost:3001/sse`. Type a query at the `Query:` prompt and enter `quit` to exit.

To connect to a different server, edit the `url` in [`mcp-server-config.js`](./mcp-server-config.js) and run `npm run build` again.
