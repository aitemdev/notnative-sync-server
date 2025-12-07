# NotNative Electron

> Personal Knowledge Management App with AI - Built with Electron, React, and TypeScript

![NotNative](./resources/icons/icon.png)

## 🎯 Features

- ✅ **Markdown Editor** with Vim keybindings (Normal/Insert/Visual/Command modes)
- ✅ **AI Chat** with 40+ tools via OpenRouter
- ✅ **Databases** (Notion-like) with inline properties `[key::value]`
- ✅ **Formula support** (SUM, AVERAGE, etc.)
- ✅ **Graph View** for note connections
- ✅ **MCP REST API** on port 8788
- ✅ **Quick Notes** floating window
- ✅ **System Tray** integration
- ✅ **i18n** support (Spanish/English)
- ✅ **Semantic Search** with embeddings

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/notnative-electron.git
cd notnative-electron

# Install dependencies
npm install

# Start development
npm run dev
```

### Build

```bash
# Build for production
npm run build

# Build for specific platform
npm run build:linux
npm run build:win
npm run build:mac
```

## 📁 Project Structure

```
notnative-electron/
├── src/
│   ├── main/              # Electron main process
│   │   ├── database/      # SQLite with better-sqlite3
│   │   ├── files/         # File system operations
│   │   ├── ipc/           # IPC handlers
│   │   ├── mcp/           # MCP REST API server
│   │   ├── tray/          # System tray
│   │   └── windows/       # Window management
│   │
│   ├── renderer/          # React frontend
│   │   ├── components/    # React components
│   │   ├── hooks/         # Custom hooks
│   │   ├── stores/        # Zustand stores
│   │   └── styles/        # CSS styles
│   │
│   ├── preload/           # Preload scripts
│   │
│   └── shared/            # Shared types and constants
│
├── resources/             # Icons and assets
└── dist/                  # Build output
```

## 🔧 Configuration

### Notes Directory

By default, notes are stored in `~/Documents/NotNative Notes/`.

### MCP Server

The MCP REST API runs on `http://localhost:8788` by default.

Example usage with curl:
```bash
# List all notes
curl http://localhost:8788/notes

# Search notes
curl http://localhost:8788/search?q=query

# Create a note via JSON-RPC
curl -X POST http://localhost:8788/rpc \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"create_note","params":{"name":"New Note","content":"# Hello"}}'
```

## ⌨️ Keyboard Shortcuts

### Global
| Shortcut | Action |
|----------|--------|
| `Ctrl+P` | Quick search |
| `Ctrl+N` | New note |
| `Ctrl+S` | Save note |
| `Ctrl+Shift+N` | Quick note window |

### Vim Mode
| Key | Mode | Action |
|-----|------|--------|
| `i` | Normal | Enter Insert mode |
| `Esc` | Insert | Return to Normal |
| `v` | Normal | Enter Visual mode |
| `:w` | Command | Save |
| `:q` | Command | Close |
| `dd` | Normal | Delete line |
| `yy` | Normal | Copy line |
| `p` | Normal | Paste |

## 🤖 AI Chat Tools

The AI assistant has access to 40+ tools including:

- **Notes**: create, read, update, delete, search
- **Folders**: list, create, delete
- **Tags**: add, remove, list
- **Search**: full-text, semantic
- **Utility**: daily notes, reminders

## 📝 Inline Properties

Use inline properties in your notes:

```markdown
# Book Notes

[author::George Orwell]
[year::1949]
[rating::5]
[read::true]

Grouped properties:
[title::1984, author::Orwell, genre::Dystopian]
```

## 🗄️ Database Schema

Uses SQLite with FTS5 for full-text search. Main tables:
- `notes` - Note metadata
- `tags` - Tags with colors
- `note_tags` - Note-tag relations
- `notes_fts` - Full-text search index
- `inline_properties` - Extracted properties
- `note_embeddings` - Vector embeddings
- `chat_sessions` / `chat_messages` - AI chat history
- `reminders` - Scheduled reminders
- `bases` - Database configurations

## 🌐 i18n

Supports Spanish and English. Add translations in:
- `src/main/i18n/es.ts`
- `src/main/i18n/en.ts`

## 📄 License

MIT License - See [LICENSE](./LICENSE) for details.

## 🙏 Acknowledgments

- Original NotNative by the Rust/GTK4 team
- [Electron](https://electronjs.org/)
- [React](https://react.dev/)
- [CodeMirror](https://codemirror.net/)
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)
- [Catppuccin](https://github.com/catppuccin) theme

---

Built with ❤️ and ☕
