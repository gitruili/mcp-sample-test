[English](./README.md) | **日本語**

# クイックスタート・リソース

以下の Model Context Protocol チュートリアルで紹介されているサーバーとクライアントをまとめたリポジトリです。
- mcp サーバー – SSE を使ったシンプルな MCP ヘルスメトリクスサーバー
- mcp クライアント – LLM を活用したチャットボット型 MCP クライアント

## 前提条件

- [Node.js](https://nodejs.org/) 18 以上
- npm（Node.js に同梱）

## サーバーの起動

ヘルスメトリクスサーバーは [`mcp-server-typescript`](./mcp-server-typescript) にあります。

```bash
cd mcp-server-typescript
npm install
npm run build
node build/index.js
```

サーバーはポート `3001` で待ち受け、`http://localhost:3001/sse` で SSE 経由の MCP を提供します。クライアントを使用する間は、サーバーを起動したままにしてください。

## クライアントの起動

チャットボットクライアントは [`mcp-client-typescript`](./mcp-client-typescript) にあります。上記の SSE サーバーに接続するため、先にサーバーを起動してください。また、`OPENAI_API_KEY` 環境変数に OpenAI API キーを設定する必要があります。

```bash
cd mcp-client-typescript
npm install
npm run build
export OPENAI_API_KEY=sk-...
node build/index.js
```

`Query:` プロンプトで質問を入力し、終了するには `quit` と入力してください。

詳細については、各プロジェクトディレクトリの README を参照してください。
