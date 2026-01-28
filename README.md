# 🍺 Dockhand Tavern

Fast, beautiful dashboard for [Dockhand](https://github.com/dockhand/dockhand) container management.

## Features

- **Server-side rendered** - Instant page loads with in-memory cache
- **Client-side filtering** - Filter by name, environment, or stack without reloading
- **Webhook updates** - Real-time data refresh when containers change
- **Catppuccin theme** - Beautiful Mocha pastel colors
- **Smart labels** - Custom display names and URLs via Docker labels
- **Icon support** - Automatic icons from [selfh.st/icons](https://selfh.st/icons)

## Quick Start

1. **Install dependencies:**
   ```bash
   bun install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your Dockhand credentials
   ```

3. **Start the server:**
   ```bash
   bun run dev
   ```

4. **Open dashboard:**
   ```
   http://localhost:3001
   ```

## Environment Variables

```bash
DOCKHAND_URL=http://localhost:3000      # Your Dockhand instance URL
DOCKHAND_USERNAME=admin                  # Dockhand username
DOCKHAND_PASSWORD=your-password          # Dockhand password (required)
PORT=3001                                # Dashboard port
```

## Docker Labels

Customize container display with labels:

```yaml
services:
  myapp:
    image: myapp:latest
    labels:
      # Display name (priority: dockhand-tavern.name > homepage.name > container name)
      dockhand-tavern.name: "My App"
      homepage.name: "My App"
      
      # Custom URL (priority: dockhand-tavern.href > homepage.href > auto-generated)
      dockhand-tavern.href: "https://myapp.example.com"
      homepage.href: "https://myapp.example.com"
      
      # Custom icon (from selfh.st/icons or custom URL)
      homepage.icon: "plex.png"
```

## Features

### Filtering
- **Search** - Filter by container name
- **Environment** - Click environment ribbons or use dropdown
- **Stack** - Click stack labels (visible on hover) or use dropdown
- **URL state** - Filters persist in URL for bookmarking

### Container Cards
- Single port: Container name is clickable
- Multiple ports: All ports shown as links
- Environment ribbons: Color-coded by environment
- Stack labels: Shown on hover or when filtered

## Tech Stack

- **Runtime:** Bun
- **Backend:** Elysia
- **Frontend:** Server-side rendered HTML with client-side filtering
- **Styling:** Catppuccin Mocha theme


## Todo
- [ ] Add external links

## License

MIT
