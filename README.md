# Quickstart Resources

A repository of MCP servers and clients from the Model Context Protocol tutorials:

- **MCP server** – a health-metrics server that exposes tools and resources over SSE
- **MCP client** – an LLM-powered chatbot that connects to the server and uses OpenAI models

The two projects are separate npm packages. The client talks to the server over SSE, so install and start the server first.

## Prerequisites

- [Node.js](https://nodejs.org/) 18 or newer. Check with `node --version`.
- npm, which is bundled with Node.js. Check with `npm --version`.
- An [OpenAI API key](https://platform.openai.com/api-keys) for the client.
- Network access to install npm packages. The server also calls an external health-data API when its tools are used.

## Installation

Run the steps below from the repository root (the directory containing this README). Use two terminals: one for the server and one for the client.

### 1. Clone the repository

Skip this step if you already have the repository locally.

```bash
git clone https://github.com/gitruili/mcp-sample-test.git
cd mcp-sample-test
```

### 2. Install and build the server

```bash
cd mcp-server-typescript
npm install
npm run build
```

`npm install` installs the dependencies, and `npm run build` compiles the TypeScript source into `build/`. Run `npm run build` again after changing files in `src/`.

### 3. Start the server

From `mcp-server-typescript`, run:

```bash
node build/index.js
```

The server listens on port `3001` and prints:

```text
MCP server listening on http://localhost:3001/sse
```

Keep this terminal open while you use the client. To check the SSE endpoint, run the following in another terminal:

```bash
curl -N http://localhost:3001/sse
```

It should print `event: endpoint` and then wait for events. Press `Ctrl+C` to end the check.

### 4. Install and build the client

In the second terminal, from the repository root:

```bash
cd mcp-client-typescript
npm install
npm run build
```

### 5. Configure the OpenAI API key

Create a local `.env` file from the template:

```bash
cp .env.example .env
```

Open `.env` and set your key:

```text
OPENAI_API_KEY=sk-...
```

Alternatively, export the key in the current shell instead of using `.env`:

```bash
export OPENAI_API_KEY=sk-...
```

`.env` is in `.gitignore`, so it will not be committed. Do not share your key.

### 6. Start the client

From `mcp-client-typescript`, run:

```bash
node build/index.js
```

Expected output (the exact tool list may change):

```text
Connecting to servers: demo-sse
Connected to server 'demo-sse' with tools: [ 'healthMetrics', 'interpretHealthMetrics', 'getHealthImageData' ]
Available resources on server 'demo-sse': [ 'cittaDoc' ]

MCP Client Started!
Type your queries or 'quit' to exit.

Query:
```

Type a question at the `Query:` prompt and press Enter. Type `quit` and press Enter to exit. If the client cannot connect, make sure the server from step 3 is still running.

## Troubleshooting

- **`OPENAI_API_KEY environment variable is required`** – the key is missing. Repeat step 5, and start the client from `mcp-client-typescript` so that it can find `.env`.
- **`Failed to connect to server 'demo-sse'` or `ECONNREFUSED`** – the server is not running or is not listening on port 3001. Start it with step 3.
- **`EADDRINUSE: address already in use :::3001`** – another process is using port 3001. Stop that process (for example, `lsof -i :3001`, then `kill <PID>`) and start the server again.
- **`Unsupported engine` or unexpected syntax errors** – check `node --version`. Node.js 18 or newer is required.
- **Health-metrics calls time out** – the server calls an external health-data API at `http://43.138.239.43:8000`. The server and client still start without it, but tool calls need network access to that host.
- **The client connects but OpenAI calls fail** – check that the key is valid and that the OpenAI account has available quota.

## Project READMEs

- [`mcp-server-typescript`](./mcp-server-typescript) – the SSE health-metrics server
- [`mcp-client-typescript`](./mcp-client-typescript) – the OpenAI chatbot client
