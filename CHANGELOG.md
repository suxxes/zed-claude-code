# Changelog

All notable changes to Zed Claude Code will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.3] - 2025-08-31

### Fixed
- GitHub release workflow now handles existing releases properly by using `gh` CLI with `--clobber` flag instead of failing on immutable releases
- Fixed glob pattern in release workflow from `dist/**/*` to `dist/*` to properly match files in dist directory

## [1.0.0] - 2025-08-31

### Added
- Initial release of Zed Claude Code
- Multi-protocol bridge between Claude Code and Zed editor
- Agent Client Protocol (ACP) implementation
- Model Context Protocol (MCP) support
- Session management with O(1) lookup performance
- Comprehensive tool integration:
  - File operations (read, write, edit, multi-edit)
  - Search operations (glob, grep, ls)
  - Execution operations (bash, task delegation)
  - Planning operations (todo management, plan mode)
  - Web operations (fetch, search)
  - Notebook operations (Jupyter cell editing)
- Permission system with user approval workflow
- Rich UI integration with diff visualization
- Full TypeScript implementation with strict type checking
- 523 comprehensive unit tests

### Improved
- Session query management with per-session query objects
- URL-based URI parsing for file:// and zed:// protocols
- Unicode support in file paths and URIs
- Conversation history preservation across messages
- Interrupt capability for active sessions

### Technical Details
- Built with Node.js 18+ and TypeScript 5.9.2
- Uses Vitest for testing with full coverage
- Biome for code quality and formatting
- ESBuild for fast bundling
- Map-based session storage for performance
- Modular architecture with clear separation of concerns

### Security
- Zod schema validation for all tool parameters
- Path validation to prevent directory traversal
- Session isolation to prevent cross-session data leaks
- Leverages Claude CLI authentication

### Documentation
- Comprehensive README with architecture diagrams
- Tool reference documentation
- Troubleshooting guide
- Contributing guidelines
- Apache 2.0 License (compatible with original Google Gemini ACP)

### Known Issues
- Context compaction not yet implemented for long conversations
- Tool usage reporting to user could be more informative
- multi_edit tool may occasionally corrupt files when handling complex edits

### Contributors
- Initial implementation based on Google Gemini Agent Client Protocol
