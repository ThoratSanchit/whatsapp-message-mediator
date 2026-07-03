# WhatsApp Group Listener (Phase 1)

An enterprise-grade, clean-architecture, production-ready WhatsApp Group Listener built with **Node.js (LTS)**, **TypeScript**, and **@whiskeysockets/baileys**.

This application is designed using **SOLID principles**, featuring structured logging via **Pino**, runtime configuration validation via **Zod**, automated reconnection with exponential backoff, and graceful shutdown handling.

---

## Architecture Overview

The codebase is organized following separation of concerns and dependency injection patterns, making it highly modular and prepared for future scalability (e.g., adding AI parsers, REST APIs, databases, queue mechanisms).

```text
whatsapp/
├── session/                  # WhatsApp session authentication credentials
├── logs/                     # Application logs (app.log)
├── dist/                     # Compiled JavaScript output
├── src/
│   ├── config/
│   │   └── index.ts          # Zod environment variable parser/validator
│   ├── logger/
│   │   └── index.ts          # Pino logger config (multi-stream console + file)
│   ├── errors/
│   │   ├── app-error.ts      # Custom exception classes
│   │   └── error-handler.ts  # Global, centralized error handling pipeline
│   ├── types/
│   │   └── index.ts          # Type & Interface definitions
│   ├── utils/
│   │   └── message-normalizer.ts # Normalizes raw Baileys messages
│   ├── services/
│   │   └── whatsapp/
│   │       ├── client.ts     # Baileys Socket lifecycle and reconnection
│   │       ├── group-cache.ts # In-memory WhatsApp Group subject cache
│   │       └── listener.ts   # Subscribes to and delegates events
│   ├── handlers/
│   │   └── message-handler.ts # Formats and outputs messages
│   └── index.ts              # Entry point & Process signal listeners
├── .env.example
├── tsconfig.json
├── eslint.config.js
├── .prettierrc
└── package.json
```

---

## Features

1. **Robust QR Code Login**: Generates the connection QR code directly inside the terminal on first boot using `qrcode-terminal`.
2. **Session Persistence**: Stores authentication credentials inside `session/` to bypass QR scanning on restarts.
3. **Pino Structured Logging**: Multi-destination logging. In development, logs are pretty-printed. In production, logs are printed as raw JSON to stdout. All logs write simultaneously to `logs/app.log`.
4. **Exponential Reconnection Backoff**: Attempts to reconnect automatically with an exponential backoff time multiplier capped at 60 seconds if a network or server disconnect occurs.
5. **Group Name API Caching**: Implements an in-memory cache for group titles to prevent heavy, rate-limited requests to the WhatsApp server.
6. **Graceful Shutdown**: Intercepts `SIGINT` (Ctrl+C) and `SIGTERM` signals to close sockets cleanly and release memory.
7. **Crash Protection**: Wrapped inside central error-handling middleware ensuring a malformed message or connection issue will never cause a fatal crash.

---

## Prerequisites

Ensure you have the following installed on your system:
- **Node.js** (Latest LTS version)
- **npm** (Comes bundled with Node.js)

---

## Installation & Setup

1. **Clone the repository** (or navigate to the workspace directory).
2. **Install dependencies**:
   ```bash
   npm install
   ```
3. **Configure Environment Variables**:
   Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
   Open `.env` and configure your settings:
   - `NODE_ENV`: Set to `development` or `production`.
   - `LOG_LEVEL`: Adjust the severity threshold (`info`, `debug`, `error`, `warn`, etc.).
   - `SESSION_PATH`: Directory where WhatsApp authentication details are saved (default `./session`).
   - `LOG_PATH`: Directory where logs are saved (default `./logs`).

---

## Scripts

### 1. Development Mode
Runs the project in real-time using `tsx` (TypeScript Execute) to watch for file modifications and automatically reload:
```bash
npm run dev
```

### 2. Build for Production
Compiles TypeScript files into production-ready JavaScript code in the `dist/` directory:
```bash
npm run build
```

### 3. Production Start
Starts the compiled JavaScript application:
```bash
npm start
```

### 4. Code Formatting
Applies Prettier rules across all TypeScript source files:
```bash
npm run format
```

### 5. Linting
Runs ESLint with TypeScript configurations to verify syntax and enforce code quality:
```bash
npm run lint
```

---

## Structured Output Format

When a message is received (excluding status updates), it is formatted and printed using the Pino logger:

```text
------------------------------------------------
Timestamp : YYYY-MM-DD HH:mm:ss
Group : [Group Name] or [Private Chat]
Sender : Sender Pushname (JID)
Message Type : text / image / sticker / etc.
Message : [Text content or caption]
------------------------------------------------
```

---

## Future Extensibility Plan

This architecture is engineered to easily layer on production modules for Phase 2+:
- **AI Parsing**: Inject a message parser service into `MessageHandler` to forward texts to OpenAI/Claude.
- **REST APIs**: Integrate Express/NestJS in `src/index.ts` to expose endpoints.
- **Queue/Workers**: Incorporate BullMQ or Redis to publish messages asynchronously.
- **Docker**: Simple Dockerfile deployment using multi-stage builds.
- **Observability**: Expose Prometheus metrics or OpenTelemetry instrumentation through the socket connection.
