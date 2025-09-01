[![MseeP.ai Security Assessment Badge](https://mseep.net/pr/suxxes-zed-claude-code-badge.png)](https://mseep.ai/app/suxxes-zed-claude-code)

# Zed Claude Code

## Overview

Zed Claude Code is a multi-protocol server that enables seamless integration between Claude Code and Zed through the **Agent Client Protocol (ACP)** and **Model Context Protocol (MCP)**. It functions as an intelligent translation layer that bridges different protocol formats while providing robust, scalable communication between Claude Code capabilities and diverse client applications.

## Usage

### Quick Start

Run the agent directly using NPX or BUNX (no repository cloning required):

```bash
# Using NPX
npx zed-claude-code

# Using BUNX  
bunx zed-claude-code
```

### Zed Integration

Configure the agent in your Zed settings by adding it to `agent_servers`. Open your Zed settings and add:

```json
{
  "agent_servers": {
    "Zed Claude Code": {
      "command": "npx",
      "args": ["zed-claude-code"],
      "env": {}
    }
  }
}
```

For development or if you prefer bunx:

```json
{
  "agent_servers": {
    "Zed Claude Code": {
      "command": "bunx",
      "args": ["zed-claude-code"],
      "env": {}
    }
  }
}
```

> 💡 **Note**: The server will automatically install `@anthropic-ai/claude-code` on first run if not present.

For more information on configuring external agents in Zed, see the [Zed External Agents documentation](https://zed.dev/docs/ai/external-agents).

## Architecture

```
┌─────────────────┐    ACP     ┌─────────────────┐    Claude SDK    ┌─────────────────┐
│                 │◄──────────►│                 │◄────────────────►│                 │
│      Zed        │  stdin/out │ Zed Claude Code │    HTTP/MCP      │   Claude API    │
│                 │            │                 │                  │                 │
└─────────────────┘            └─────────────────┘                  └─────────────────┘
                                        │
                                        │ MCP Tools
                                        ▼
                               ┌─────────────────┐
                               │                 │
                               │  File System    │
                               │  Operations     │
                               │                 │
                               └─────────────────┘
```

## Protocol Flow

### Session Creation
1. Zed initiates ACP connection via stdin/stdout
2. Zed Claude Code receives `initialize` and `newSession` requests
3. Server creates Claude Code SDK query with MCP server configuration
4. Internal HTTP server starts for MCP tool communication
5. Session is stored in Map for O(1) access performance

### Tool Execution
1. Claude requests tool use via SDK
2. Zed Claude Code translates tool request to ACP format
3. Zed receives tool call notification with metadata
4. User approves/denies tool execution in Zed
5. Tool result flows back through MCP → SDK → ACP chain
6. Results include location information and diff data

### Conversation Management
1. Session maintains conversation history across messages
2. Query object per session enables interruption and streaming
3. Context preserved for follow-up messages
4. Proper handling of assistant and user message flows

## Key Features

### 🔄 **Protocol Translation**
- **ACP ↔ Claude SDK**: Message format conversion
- **Snake_case ↔ CamelCase**: External API compatibility with internal code quality
- **Tool Metadata**: Rich UI information for tool calls
- **URL-based URI Parsing**: Robust handling of file:// and zed:// protocols with Unicode support

### 🛠️ **Tool Integration** 
- **File Operations**: Read, write, edit with diff visualization
- **Multi-Edit**: Batch file modifications with line tracking
- **Permission System**: User approval workflow for tool execution
- **Caching**: Optimized file content caching for performance

### 🏗️ **Architecture Benefits**
- **Map-based Storage**: O(1) session lookup performance
- **Modular Design**: Separation of concerns across components
- **Type Safety**: Full TypeScript implementation with strict checking
- **Error Handling**: Comprehensive error propagation and logging
- **Session Query Management**: Per-session query objects with interrupt capability
- **Test Coverage**: 523 comprehensive unit tests ensuring reliability

## Development

> 💡 **Repository cloning is only required for development. For usage, see the Usage section above.**

### Prerequisites
- Node.js 18+
- Claude Code installed and authenticated
- TypeScript development environment

### Setup
```bash
# Clone repository
git clone https://github.com/suxxes/zed-claude-code.git
cd zed-claude-code

# Install dependencies
npm install

# Build the project
npm run build

# Run in development
npm run dev

# Run tests
npm test

# Linting and formatting
npm run lint
npm run format
```

### Code Standards
- **TypeScript**: Full type coverage required
- **Biome**: Code formatting and linting with `npm run lint` and `npm run format`
- **Testing**: Unit tests for new functionality
- **Comments**: Document complex logic and external APIs

### Protocol Compatibility
- **External APIs**: Must maintain snake_case for ACP/MCP compatibility
- **Internal Code**: Use camelCase for TypeScript best practices
- **Tool Names**: Follow `mcp__zcc__*` naming convention
- **Error Handling**: Provide clear error messages for debugging

## Tool Reference

### File Operations
- **`mcp__zcc__read_file`** - Read file contents with optional range
- **`mcp__zcc__edit_file`** - Edit files with old/new text replacement  
- **`mcp__zcc__write_file`** - Write full file contents
- **`mcp__zcc__multi_edit`** - Batch edit operations

### Search Operations
- **`Glob`** - Pattern-based file matching
- **`Grep`** - Content search with regex support
- **`LS`** - Directory listing

### Execution Operations  
- **`Bash`** - Command execution with output capture
- **`Task`** - Agent delegation for complex operations

### Planning Operations
- **`TodoWrite`** - Task management and planning
- **`ExitPlanMode`** - Plan completion workflow

### Web Operations
- **`WebFetch`** - HTTP content retrieval
- **`WebSearch`** - Search engine integration

### Notebook Operations
- **`NotebookEdit`** - Jupyter notebook cell editing

### Permission System
- **`permission_request`** - User approval workflow
- Supports "Always Allow", "Allow Once", "Reject" options
- Tool-specific permission caching

### UI Integration  
- **Rich diff visualization** with old/new content
- **Location information** with file paths and line numbers
- **Tool metadata** including descriptions and parameters
- **Plan integration** with TodoWrite tool support

## Security Considerations

### File Access
- All file operations respect client capabilities
- Path validation prevents directory traversal
- Error messages avoid information disclosure

### Authentication
- Leverages Claude CLI authentication
- Supports both CLI login and API key methods
- Session isolation prevents cross-session data leaks

### Input Validation  
- Zod schema validation for all tool parameters
- Type-safe parameter handling throughout codebase
- Comprehensive error handling and logging

## Troubleshooting

### Common Issues

#### **Authentication Errors**
```
Error: Please run /login
```
**Solution**: Run `claude /login` in terminal or configure API key

#### **Session Not Found**
```
Error: Session not found: uuid
```
**Solution**: Check session lifecycle and cleanup logic

#### **Tool Permission Denied**
```
Error: User refused permission to run tool  
```
**Solution**: User needs to approve tool execution in Zed

#### **Port Conflicts**
```
Error: EADDRINUSE :::port
```
**Solution**: Server automatically selects available ports

### Debugging
Enable debug logging:
```bash
npx zed-claude-code --debug
bunx zed-claude-code --debug
```

View detailed logs:
```bash
tail -f logs/zed-claude-code.log
```

You can also access ACP logs in Zed using the "dev: open acp logs" command in the Command Palette.

## Contributing

### Development Setup
1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Make changes with tests
4. Ensure build passes: `npm run build`
5. Run linting: `npm run lint` and `npm run format`
6. Commit changes: `git commit -m 'Add amazing feature'`
7. Push to branch: `git push origin feature/amazing-feature`
8. Open Pull Request

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

**Note**: This implementation is based on the original Google Gemini Agent Client Protocol implementation and therefore uses the Apache 2.0 license to maintain compatibility with the original open-source project.

## Support

For issues and questions:
- **GitHub Issues**: [Create an issue](https://github.com/suxxes/zed-claude-code/issues)
- **Logs**: Enable debug logging for troubleshooting

---

*Built with ❤️ for seamless Zed and Claude Code integration*
