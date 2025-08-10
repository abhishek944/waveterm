# Wave Terminal - Repository Overview

Wave Terminal is an **AI-native terminal application** that combines traditional terminal functionality with modern AI capabilities. It's built as a desktop application using Electron with a React/TypeScript frontend and Go backend.

## Tech Stack

### Frontend

-   **Electron** - Desktop application framework
-   **React 18.3.1** - UI framework
-   **TypeScript** - Type-safe JavaScript
-   **MobX 6.12.5** - State management
-   **Webpack** - Module bundler
-   **Tailwind CSS 4.1.11** - Utility-first CSS framework
-   **Monaco Editor 0.48.0** - Code editor component
-   **xterm.js 5.3.0** - Terminal emulator

### Backend

-   **Go 1.23+** - Primary backend language
-   **SQLite** - Local database (with JSON column support)
-   **golang-migrate** - Database migration management

## Major Component Groups

### 1. Frontend UI Layer (`/src`)

#### Electron Shell

-   Desktop application framework handling window management and OS integration
-   Entry point: `src/electron/emain.ts`

#### React Application

-   Modern UI with components for terminal tabs, sidebars, and settings
-   Main entry: `src/app/app.tsx`
-   Key directories:
    -   `/app/sidebar` - Sidebar components including AI chat interface
    -   `/app/clientsettings` - Client settings UI including AI providers
    -   `/app/workspace` - Workspace and terminal views
    -   `/app/line` - Line-based terminal output components
    -   `/app/common` - Shared UI components and utilities

#### Content Renderers (`/src/plugins`)

-   Terminal renderer - Core terminal display
-   Markdown viewer - Rich markdown rendering
-   Code viewer - Syntax highlighted code display
-   CSV viewer - Tabular data with sorting
-   Image viewer - Image display support
-   PDF viewer - PDF document rendering
-   OpenAI plugin - AI integration

#### State Management (`/src/models`)

-   MobX-based reactive state handling
-   WebSocket connection management
-   Command execution coordination
-   Screen and session management

### 2. Backend Services

#### Wave Server (`/wavesrv`)

Main Go backend service handling:

-   **Entry point**: `wavesrv/cmd/main-server.go`
-   **Core packages** (`/pkg`):
    -   `/sstore` - Storage and database operations
    -   `/remote` - Remote connections and AI integrations (OpenAI, Gemini, Azure)
    -   `/cmdrunner` - Command execution and AI command processing
    -   `/scws` - WebSocket communication with frontend
    -   `/blockstore` - Block-based file storage for large content

#### Wave Shell (`/waveshell`)

Specialized Go service for shell operations:

-   **Entry point**: `waveshell/main-waveshell.go`
-   Shell integration (Bash, Zsh support)
-   PTY (pseudo-terminal) management
-   Remote connection handling
-   Command execution in isolated environments

### 3. Data Layer

#### SQLite Database

-   Local storage with JSON columns for flexibility
-   Stores sessions, workspaces, settings, and command history
-   Location: `~/.waveterm/` (production) or `~/.waveterm-dev/` (development)

#### Migration System (`/wavesrv/db/migrations`)

-   Version-controlled database schema evolution
-   Uses golang-migrate for managing migrations
-   Currently at version 32
-   Recent additions include AI options (`aiopts`) column

#### Block Storage

-   File-based storage for larger content blocks
-   Efficient handling of terminal output and file content

### 4. AI Integration Layer

#### Supported Providers

-   OpenAI (GPT models)
-   Google Gemini
-   Azure OpenAI

#### Features

-   AI chat sidebar for interactive assistance
-   Agent mode for autonomous command execution
-   Thread mode for conversational interactions
-   Natural language command processing
-   Context-aware suggestions

### 5. Build & Development Tools

#### ScriptHaus

-   Custom build orchestration tool
-   Configuration in `scripthaus.md`
-   Manages complex build workflows

#### Development Setup

-   Hot reload with webpack watch mode
-   Separate development database
-   Development server: `run-dev.sh`

#### Packaging

-   Electron Builder for cross-platform builds
-   Supports macOS and Linux
-   Both AMD64 and ARM64 architectures

## Architecture Flow

1. **User Interaction**: User interacts with the React UI (terminal tabs, AI chat, settings)
2. **WebSocket Communication**: Commands/actions are sent via WebSocket to the Go backend
3. **Backend Processing**:
    - Wave Server processes commands
    - Delegates to Wave Shell for terminal operations
    - Calls AI providers for AI-assisted features
4. **Response Streaming**: Results are streamed back to the frontend
5. **Content Rendering**: Appropriate plugins render the content (terminal output, markdown, code, etc.)

## Key Features

### Terminal Features

-   Multi-tab terminal interface
-   Session persistence across restarts
-   Command history and bookmarks
-   Custom keybindings
-   Theme customization

### AI Capabilities

-   Natural language to command translation
-   Code explanation and generation
-   Error diagnosis and solutions
-   Context-aware command suggestions

### Rich Content Support

-   Markdown preview with live updates
-   Syntax-highlighted code viewing
-   CSV data exploration
-   Image and PDF viewing
-   Media playback capabilities

## Current Development Focus

Based on recent commits and active changes:

-   Enhanced AI provider settings and configuration
-   Agent and thread mode implementations
-   Improved input positioning and threading features
-   Module structure optimization
-   Migration system improvements

## Directory Quick Reference

```
waveterm/
-src/                    # Frontend source code
---app/               # React application components
---models/            # MobX state models
---plugins/           # Content renderer plugins
---electron/          # Electron main process
---wavesrv/               # Go backend server
---cmd/               # Server entry point
---pkg/               # Core packages
---db/migrations/     # Database migrations
-waveshell/             # Go shell service
-flows/                 # Documentation and workflows
-build/                 # Build artifacts
-node_modules/          # NPM dependencies
```

This architecture enables Wave Terminal to be a powerful, AI-enhanced terminal that maintains the performance of native terminal operations while adding modern UI capabilities and AI assistance.
