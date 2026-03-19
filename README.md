# Debug MCP

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE.md)

> debug-test-mcp is an MCP Server which has tools like `get-request-headers` which returns all headers that were sent with the current request

Use this Server to debug your MCP Host / Client custom header implementation.

## Getting Started

### Prerequisites

Before you start with **sample-mcp-server**, ensure the following are installed:

- **[Node.js](https://nodejs.org/)** (v18 or above recommended)  
  Required to run the server and manage dependencies.

```bash
brew install node
```

- **[PNPM](https://pnpm.io/)** (v10 or above recommended)
  The project uses PNPM as its package manager.  
  Install globally with:

```bash
npm install -g pnpm
```

### Setup

Install dependencies:

```bash
pnpm i
```

Start MCP Server on localhost:3333 :

```bash
pnpm dev
```

Install dependencies & start server in one command:

```bash
pnpm d
```

**Server URL `http://localhost:3333/mcp`**

### Tunneling

If your host requires HTTPS you can easily tunnel the server via a service like [ngrok](https://ngrok.com/):

```bash
ngrok http 3333
```
