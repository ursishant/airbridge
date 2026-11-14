# Contributing to AirBridge

Thank you for your interest in contributing to AirBridge. We welcome bug reports, feature suggestions, and code contributions that improve macOS to Android continuity.

## Development Setup

### Prerequisites
- Node.js 18 or newer
- npm 9 or newer
- macOS for native host testing

### Installation

1. Fork and clone the repository:
   ```bash
   git clone https://github.com/ursishant/airbridge.git
   cd airbridge
   ```

2. Install dependencies for both frontend and server:
   ```bash
   npm install --prefix server
   npm install --prefix frontend
   ```

3. Start the development server and frontend:
   ```bash
   # Terminal 1: Start backend server
   node server/index.js

   # Terminal 2: Start frontend dev server
   npm run dev --prefix frontend
   ```

## Pull Request Guidelines

1. Create a descriptive feature branch from `main`.
2. Follow established project formatting and architecture.
3. Ensure the frontend builds cleanly without warnings or type errors:
   ```bash
   npm run build --prefix frontend
   ```
4. Verify backend syntax and security compliance:
   ```bash
   node -c server/index.js
   ```
5. Commit messages must be clear, conventional, and free of emojis.
6. Submit a pull request targeting `main` with a clear explanation of changes.

## Security Disclosures

If you discover a security vulnerability, please do not disclose it in a public issue. Refer to [SECURITY.md](SECURITY.md) to report security concerns privately.
