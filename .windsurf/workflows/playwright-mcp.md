---
description: Playwright MCP - Browser automation via Model Context Protocol
---

## Overview

Playwright MCP provides browser automation using Playwright's accessibility tree (not screenshots). It is LLM-friendly, token-efficient, and requires no vision models.

## When to Use

- **MCP (this skill):** Persistent browser sessions, exploratory automation, self-healing tests, long-running autonomous workflows requiring continuous browser context.
- **CLI + SKILLS:** High-throughput coding agents balancing browser automation with large codebases — more token-efficient.

## Setup

### MCP Client Config (add to your MCP client settings)

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": [
        "@playwright/mcp@latest"
      ]
    }
  }
}
```

### Requirements
- Node.js 18 or newer
- An MCP client: VS Code, Cursor, Windsurf, Claude Desktop, Goose, etc.

---

## Common Usage Patterns

### 1. Basic headed browser (default)
```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest"]
    }
  }
}
```

### 2. Headless mode
```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest", "--headless"]
    }
  }
}
```

### 3. Isolated session (no persistent storage)
```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest", "--isolated"]
    }
  }
}
```

### 4. Isolated session with saved storage state
```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": [
        "@playwright/mcp@latest",
        "--isolated",
        "--storage-state=path/to/storage.json"
      ]
    }
  }
}
```

### 5. Standalone server (headless/remote display environments)
```bash
npx @playwright/mcp@latest --port 8931
```
Then configure the client to use the HTTP endpoint:
```json
{
  "mcpServers": {
    "playwright": {
      "url": "http://localhost:8931/mcp"
    }
  }
}
```

### 6. Enable optional capabilities
```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest", "--caps=vision,pdf,devtools"]
    }
  }
}
```

---

## Key Options Reference

| Option | Description |
|---|---|
| `--browser` | Browser to use: `chrome`, `firefox`, `webkit`, `msedge` |
| `--headless` | Run in headless mode (headed by default) |
| `--isolated` | Isolated profile, cleared on session close |
| `--user-data-dir` | Path to persistent user data directory |
| `--storage-state` | Path to storage state JSON (cookies + localStorage) |
| `--viewport-size` | Browser viewport, e.g. `1280x720` |
| `--device` | Emulate a device, e.g. `iPhone 15` |
| `--port` | Port for SSE/HTTP transport |
| `--caps` | Extra capabilities: `vision`, `pdf`, `devtools`, `testing`, `tracing` |
| `--proxy-server` | Proxy server URL |
| `--timeout-action` | Action timeout in ms (default: 5000) |
| `--timeout-navigation` | Navigation timeout in ms (default: 60000) |
| `--save-trace` | Save Playwright trace to output directory |
| `--save-video` | Save session video, e.g. `--save-video=800x600` |
| `--output-dir` | Directory for output files |
| `--config` | Path to JSON configuration file |
| `--init-script` | JS file evaluated in every page before page scripts |
| `--init-page` | TypeScript file evaluated on the Playwright page object |
| `--codegen` | Code generation language: `typescript` or `none` |
| `--ignore-https-errors` | Ignore HTTPS errors |
| `--no-sandbox` | Disable sandbox (useful in CI/Docker) |

---

## Persistent Profile Locations

The default persistent profile is stored at:

| OS | Path |
|---|---|
| Windows | `%USERPROFILE%\AppData\Local\ms-playwright\mcp-{channel}-profile` |
| macOS | `~/Library/Caches/ms-playwright/mcp-{channel}-profile` |
| Linux | `~/.cache/ms-playwright/mcp-{channel}-profile` |

Override with `--user-data-dir` to use a custom location.

---

## Initial State Setup

### Storage state (cookies + localStorage)
```bash
# Load from file into isolated context
npx @playwright/mcp@latest --storage-state=path/to/storage.json
```

### Page initialization (TypeScript)
```typescript
// init-page.ts
export default async ({ page }) => {
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({ latitude: 37.7749, longitude: -122.4194 });
  await page.setViewportSize({ width: 1280, height: 720 });
};
```
```bash
npx @playwright/mcp@latest --init-page=init-page.ts
```

### Browser initialization script (JavaScript)
```javascript
// init-script.js
window.isPlaywrightMCP = true;
```
```bash
npx @playwright/mcp@latest --init-script=init-script.js
```

---

## Available Tool Categories

| Category | Opt-in Flag |
|---|---|
| Core automation | Always available |
| Tab management | Always available |
| Browser installation | Always available |
| Coordinate-based (vision) | `--caps=vision` |
| PDF generation | `--caps=pdf` |
| Test assertions | `--caps=testing` |
| Tracing | `--caps=tracing` |
| DevTools | `--caps=devtools` |

---

## Browser Extension (Connect to Existing Browser)

Install the **Playwright MCP Bridge** extension in Chrome/Edge, then use:
```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest", "--extension"]
    }
  }
}
```
This lets you connect to existing browser tabs using your logged-in sessions.
