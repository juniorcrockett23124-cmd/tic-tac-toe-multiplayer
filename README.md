# Tic-Tac-Toe v4

A real-time multiplayer Tic-Tac-Toe game built with React, TypeScript, and Cloudflare Workers.

## Features

- Real-time WebSocket gameplay via Cloudflare Durable Objects
- Queue system for managing players
- Automatic reconnect with exponential backoff
- Match history tracking
- Modern UI with dark theme

## Structure

- `src/` - React frontend source code
  - `worker.ts` - Cloudflare Worker with Durable Object
  - React components, hooks, and context
- `dist/` - Built frontend assets (deployed to Pages)
- `wrangler.toml` - Worker configuration

## URLs

- Frontend: https://tic-tac-toe-v4.pages.dev
- WebSocket: wss://tic-tac-toe-v4.[account].workers.dev/websocket

## Development

```bash
npm install
npm run dev       # Start development server
npm run build     # Build for production
npx wrangler deploy  # Deploy Worker
npx wrangler pages deploy dist  # Deploy frontend
```
