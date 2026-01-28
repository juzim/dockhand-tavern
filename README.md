# 🍺 Dockhand Tavern

Fast dashboard for accessing services deployed by [Dockhand](https://github.com/dockhand/dockhand).

What it's not (you already have dockhand for this): 
- metrics
- alerts
- status


Written with opencode and claude 4.5 Sonnet.

![screenshot](docs/assets/dockhand2.png?raw=true "Screenshot")


## Features

- **Webhook updates** - Real-time data refresh when containers change
- **Smart labels** - Custom display names and URLs via Docker labels
- **Icon support** - Automatic icons from [selfh.st/icons](https://selfh.st/icons)
- **nginx-proxy-manager support** - Matches IPs against proxy hosts to show domain instead if IPs

## Quick Start

### Using Docker (Recommended)

```bash
docker run -d \
  --name dockhand-tavern \
  -p 3001:3001 \
  -e DOCKHAND_URL=http://your-dockhand:3000 \
  -e DOCKHAND_USERNAME=admin \
  -e DOCKHAND_PASSWORD=your-password \
  ghcr.io/juzim/dockhand-tavern:latest
```

Open your browser at `http://localhost:3001`

### Using Bun (Development)

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

### Required
```bash
DOCKHAND_URL=http://localhost:3000      # Your Dockhand instance URL
DOCKHAND_USERNAME=admin                  # Dockhand username
DOCKHAND_PASSWORD=your-password          # Dockhand password (required)
```

### Optional
```bash
PORT=3001                                # Dashboard port (default: 3001)

# NPM (Nginx Proxy Manager) Integration - Optional
NPM_URL=http://localhost:81              # NPM instance URL
NPM_EMAIL=admin@example.com              # NPM admin email
NPM_PASSWORD=your-npm-password           # NPM password

# Bookmarks are static entries
BOOKMARKS='[
  {"name":"GitHub","url":"https://github.com","icon":"github"},
  {"name":"Portainer","url":"http://192.168.1.100:9000","icon":"portainer"},
  {"name":"Documentation","url":"https://docs.example.com"},
  {"name":"Custom Icon","url":"https://example.com","icon":"https://example.com/icon.png"}
]'
```

## Docker Labels

Customize container display with labels:

docker-compose.yaml (for your service, not dockhand-tavern or dockhand!)
```yaml

services:
    my-app:
    image: foo
    label:
        dockhand-tavern.name: "My App"
        dockhand-tavern.url: "https://myapp.example.com"
        dockhand-tavern.icon: "plex"
        dockhand-tavern.group: "Fun"
        dockhand-tavern.disable: false
       
```


## Deployment

### Docker Compose Example

```yaml
version: '3.8'
services:
  dockhand-tavern:
    image: ghcr.io/juzim/dockhand-tavern:latest
    container_name: dockhand-tavern
    ports:
      - "3001:3001"
    environment:
      DOCKHAND_URL: http://dockhand:3000
      DOCKHAND_USERNAME: admin
      DOCKHAND_PASSWORD: ${DOCKHAND_PASSWORD}
      # Optional NPM integration
      # NPM_URL: http://npm:81
      # NPM_EMAIL: admin@example.com
      # NPM_PASSWORD: ${NPM_PASSWORD}
    restart: unless-stopped
```

### Webhooks

Configure Dockhand to send webhooks to `http://dockhand-tavern:3001/webhook` for automatic dashboard updates when containers change.

In dockhand, create a new apprise notification for `json://YOUR-TAVERN-IP:PORT/webhook` and activiate the triggers in the environment config. 

