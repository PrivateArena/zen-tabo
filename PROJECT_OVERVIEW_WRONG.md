# opencode — Project Architecture

## Purpose
MCP-based AI coding assistant CLI. Creates a Model Context Protocol server with an extensible tool system (20+ tools), prompt composition engine, resource definitions, session persistence, and a terminal REPL — enabling AI agents to interact with files, shell, browser, code analysis, and project memory.

## File Tree
```
src/
  daemon/        # Background server process + HTTP routes
  lib/           # Core libraries (config, session, security, shell, etc.)
  prompts/       # Prompt loading, registration, resolution, skill detection
  resources/     # MCP resource definitions
  tools/         # Tool implementations (browser, codegraph, shell, think, etc.)
```

## Component Roles

| File / Directory | Role |
|---|---|
| src/index.ts | Entry point: creates MCP server, auto-detects workspace, registers all tools and prompts |
| src/terminal.ts | REPL terminal commander wrapping all MCP capabilities for interactive CLI use |
| src/tools/ | 13 tool modules each exporting a register* function plugged into createMcpServer |
| src/prompts/ | Prompt loading from files, memory resolution, Zsh skill detection, template substitution |
| src/daemon/ | Background daemon with HTTP routes for project memory and web UI; client for lifecycle mgmt |
| src/lib/core/config.ts | JSON-based configuration loader for tools, sandbox, wiki, Zen, token optimization |
| src/resources/zen-resources.ts | MCP resources exposing Zen configuration data via URI scheme |
| src/lib/session/session.ts | Workspace root tracking, session persistence, and activity timestamps |

## Key Architectural Patterns
1. **MCP Tool Registration**: Each tool module exports a register* function called from createMcpServer in index.ts, enabling pluggable extensions via a uniform signature
2. **Session-Based State**: Session module manages workspace root, active session ID, and persistent JSON state across MCP connections
3. **Prompt Composition Pipeline**: Prompts are loaded from multiple sources, merged with memory context, processed through substitutions, and registered with the MCP server
4. **Daemon/Client Split**: Background daemon provides HTTP endpoints for project memory analysis and collaborative web UI; client module handles process lifecycle
5. **Terminal REPL Commander**: Wraps all MCP tools into an interactive CLI with command parsing, output rendering, and direct tool routing bypassing the MCP transport

## Dependencies

| Package / Module | Role |
|---|---|
| @modelcontextprotocol/sdk | MCP server framework — tool/prompt/resource registration + transport |
| zod | Runtime schema validation for tool input parameters |
| (internal modules) | 100% of business logic lives in src/lib/ — no heavy external frameworks |
