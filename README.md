# 🍺 Dockhand Tavern

Fast dashboard for accessing services deployed by [Dockhand](https://github.com/dockhand/dockhand).

Pulls data for all containers and creates links for each service. When a state container changes, the data is refreshed.


What it's not (you already have dockhand for this): 
- metrics
- alerts
- status


Written with opencode and claude 4.5 Sonnet.

![screenshot](docs/assets/dockhand2.png?raw=true "Screenshot")


## Features

- **Webhook updates** - Real-time data refresh when containers change
- **Smart labels** - Custom display names, URLs and groups via Docker labels
- **Icon support** - Automatic icons from [selfh.st/icons](https://selfh.st/icons)
- **Bookmarks** - Services can be added manually
- **Filters** - Services can be searched and filtered by dockhand environment
- **nginx-proxy-manager support** - (optional) Automatically creates proxy hosts for services
- **Peekaping integration** - (optional) Automatically creates uptime monitors for services

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

# NPM Auto-Creation - Optional (requires NPM integration above)
# Automatically creates NPM proxy hosts for containers
NPM_AUTO_CREATE_DOMAIN=example.com       # Base domain (creates: servicename.example.com)
NPM_CERTIFICATE_ID=1                     # Certificate ID from NPM to use for SSL
NPM_PUBLIC_ACCESS_LIST_ID=1              # Access list ID for public containers (optional)
NPM_DEFAULT_ACCESS_LIST_ID=2             # Access list ID for private containers (optional)

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
    labels:
      dockhand-tavern.name: "My App"
      dockhand-tavern.url: "https://myapp.example.com"  # MUST be quoted!
      dockhand-tavern.icon: "plex"
      dockhand-tavern.group: "Fun"
      dockhand-tavern.port: "8080"  # Override port for containers with network IP
      dockhand-tavern.disable: "false"
       
```

**IMPORTANT:** Always quote label values, especially URLs with ports (e.g., `"http://192.168.1.1:8080"`). Without quotes, YAML parsers may incorrectly parse the colon.

**Available Labels:**
- `dockhand-tavern.name` - Custom display name (default: container name)
- `dockhand-tavern.url` - Custom URL (overrides automatic URL generation)
- `dockhand-tavern.icon` - Icon name from [selfh.st/icons](https://selfh.st/icons) or full URL
- `dockhand-tavern.group` - Group name for organizing containers
- `dockhand-tavern.port` - Custom port for containers on dhcp-ext network (when no exposed ports)
- `dockhand-tavern.public` - Set to `true` to use public access list in NPM (requires NPM_PUBLIC_ACCESS_LIST_ID)
- `dockhand-tavern.disable` - Set to `true` to hide container from dashboard

## NPM Auto-Creation

When NPM auto-creation is enabled (via `NPM_AUTO_CREATE_DOMAIN` and `NPM_CERTIFICATE_ID`), Dockhand Tavern will automatically create Nginx Proxy Manager proxy hosts for your containers.

### Domain Selection Priority

Dockhand Tavern determines which domain to create using the following priority order:

**1. Custom URL** (`dockhand-tavern.url`)
- If set to an HTTPS domain, extracts the domain from the URL
- Example: `https://cloud.ltrg.de` → creates `cloud.ltrg.de`
- ❌ **Skips** HTTP URLs, IP addresses, and URLs with custom ports

**2. Custom Name** (`dockhand-tavern.name`)
- If set, uses the custom name (sanitized) for domain generation
- Example: `Immich` → creates `immich.{baseDomain}`
- Spaces and special chars are converted to hyphens

**3. Service Name** (`com.docker.compose.service`)
- Uses the Docker Compose service name (sanitized)
- Example: `nextcloud` → creates `nextcloud.{baseDomain}`

**4. Container Name** (fallback)
- Uses the container name if no other labels are set
- Example: `standalone-app` → creates `standalone-app.{baseDomain}`

#### Examples

```yaml
# Example 1: Custom URL (highest priority)
services:
  nextcloud:
    labels:
      dockhand-tavern.url: "https://cloud.ltrg.de"
      dockhand-tavern.name: "My Cloud"  # Ignored
# NPM entry created: cloud.ltrg.de

# Example 2: Custom Name
services:
  immich-server:
    labels:
      dockhand-tavern.name: "Immich"
# NPM entry created: immich.ltrg.de (NOT immich-server.ltrg.de)

# Example 3: Service Name
services:
  nextcloud:
    # No custom labels
# NPM entry created: nextcloud.ltrg.de
```

**Skipped URLs:**
- ❌ HTTP URLs: `http://example.com` (not secure)
- ❌ IP addresses: `https://192.168.1.100` (not domain-based)
- ❌ Custom ports: `https://app.com:8443` (non-standard, including explicit :443)

### How it Works

1. **Auto-Creation Triggers**:
   - On startup (initial cache population)
   - When webhook is received from Dockhand (container state changes)

2. **Proxy Host Configuration**:
   - **Domain**: `{serviceName}.{NPM_AUTO_CREATE_DOMAIN}`
   - **Forward Host**: Environment's public IP
   - **Forward Port**: Container's first exposed port
   - **SSL Certificate**: Uses the certificate ID specified in `NPM_CERTIFICATE_ID`
   - **SSL Forced**: Always enabled (HTTP → HTTPS redirect)
   - **HTTP/2**: Enabled
   - **HSTS**: Enabled (without subdomains)
   - **Block Exploits**: Enabled
   - **WebSocket Upgrade**: Enabled

4. **Access Control**:
   - Use `dockhand-tavern.public: "true"` label to apply `NPM_PUBLIC_ACCESS_LIST_ID`
   - Containers without this label use `NPM_DEFAULT_ACCESS_LIST_ID`
   - If access list IDs are not configured, no access control is applied (fully public)

### Example Configuration

```bash
# .env
NPM_URL=http://192.168.1.100:81
NPM_EMAIL=admin@example.com
NPM_PASSWORD=changeme

NPM_AUTO_CREATE_DOMAIN=ltrg.de
NPM_CERTIFICATE_ID=1
NPM_PUBLIC_ACCESS_LIST_ID=1    # Optional: for public containers
NPM_DEFAULT_ACCESS_LIST_ID=2   # Optional: for private containers
```

```yaml
# docker-compose.yml (your service)
services:
  sonarr:
    image: linuxserver/sonarr
    labels:
      dockhand-tavern.group: "Media"
      dockhand-tavern.public: "true"  # Use public access list
```

This will automatically create an NPM proxy host:
- Domain: `sonarr.ltrg.de`
- SSL: Enabled with certificate ID 1
- Access: Protected by access list ID 1 (public)

### Validation

NPM auto-creation includes comprehensive validation to prevent invalid proxy hosts:

1. **Base Domain Validation** (startup-time):
   - `NPM_AUTO_CREATE_DOMAIN` must be a valid DNS domain (e.g., `ltrg.de`, `sub.example.com`)
   - ❌ Wildcards are NOT allowed (e.g., `*.ltrg.de` will be rejected)
   - ❌ Invalid formats will disable auto-creation entirely with an error message

2. **Generated Domain Validation** (runtime):
   - Each generated domain is validated before creation
   - Checks for invalid characters, proper DNS format, length limits
   - Invalid domains are skipped with a warning

3. **Certificate Coverage Validation** (runtime):
   - Fetches certificate details on startup
   - Verifies each domain is covered by the certificate
   - Supports wildcard certificates (e.g., `*.ltrg.de` covers `app.ltrg.de` but not `sub.app.ltrg.de`)
   - Provides helpful hints if domain doesn't match certificate

### Example Validation Errors

**Invalid base domain:**
```
❌ Invalid NPM_AUTO_CREATE_DOMAIN: "*.ltrg.de"
   Domain format is invalid (cannot contain wildcards, must be valid DNS name)
   NPM auto-creation disabled
```

**Domain not covered by certificate:**
```
⚠️  Skipping NPM creation for container "nextcloud"
   Generated domain "nextcloud.example.com" is not covered by certificate ID 1
   Certificate covers: [*.ltrg.de, ltrg.de]
   Hint: Consider using base domain "ltrg.de" instead of "example.com"
```

### Behavior

- **Existing Domains**: If a domain already exists in NPM, it will NOT be modified
- **Mismatch Detection**: If an existing domain points to a different target, a warning is logged
- **No Duplicates**: The same domain will never be created twice
- **Error Handling**: Failed creations are logged but don't stop other containers from being processed
- **Validation Enforcement**: Validation cannot be disabled - invalid configurations will prevent auto-creation

## Peekaping Integration (Uptime Monitoring)

Dockhand Tavern can automatically create uptime monitors in [Peekaping](https://github.com/peekaping/peekaping) for your deployed services.

### Configuration

```bash
# Required for Peekaping integration
PEEKAPING_URL=http://localhost:8034
PEEKAPING_API_KEY=your-api-key-here

# Optional: Notification configuration
PEEKAPING_NOTIFICATION_IDS='["notification-id-1"]'  # JSON array
PEEKAPING_DEFAULT_INTERVAL=60      # Check interval (seconds, min: 20)
PEEKAPING_DEFAULT_TIMEOUT=16       # Timeout (seconds, min: 16)
PEEKAPING_DEFAULT_MAX_RETRIES=3    # Max retries before marking down
```

### How It Works

1. **Monitor Creation**: When a container is deployed, a monitor is automatically created in Peekaping
2. **URL Selection Priority**:
   - If NPM proxy host exists → monitors `https://domain.com` (external URL)
   - If custom URL label exists → monitors that URL
   - Otherwise → monitors `http://{publicIp}:{port}` (internal IP)
3. **Protocol**: HTTPS if NPM proxied or custom URL is HTTPS, otherwise HTTP
4. **Monitor Name**: Uses container's display name (from `dockhand-tavern.name` label or service name)

### URL Selection Examples

```yaml
# Example 1: Container with NPM proxy host
services:
  webapp:
    image: nginx
    ports:
      - "8080:80"
# Monitor created: https://webapp.example.com (if NPM proxy exists)
# Otherwise: http://192.168.1.100:8080

# Example 2: Custom URL label (takes priority)
services:
  api:
    image: node
    labels:
      dockhand-tavern.url: "https://api.example.com"
# Monitor created: https://api.example.com

# Example 3: Internal service (no proxy, no custom URL)
services:
  db:
    image: postgres
    ports:
      - "5432:5432"
# Monitor created: http://192.168.1.100:5432
```

### Labels

- **`dockhand-tavern.monitor-disable: "true"`** - Skip Peekaping monitor creation for this container

```yaml
services:
  internal-db:
    image: postgres
    labels:
      dockhand-tavern.monitor-disable: "true"  # Don't monitor this service
```

### Getting Your API Key

1. Log in to your Peekaping instance
2. Go to Settings → API Keys
3. Create a new API key
4. Copy the key and set it as `PEEKAPING_API_KEY`

### Behavior

- **Existing Monitors**: If a monitor with the same name already exists, it will NOT be modified
- **No Duplicates**: The same monitor will never be created twice
- **Error Handling**: Failed creations are logged but don't stop other containers from being processed
- **Notifications**: If no notification IDs are configured, monitors are created without notifications

### Monitor Tags

Monitors are automatically tagged for easy organization:

**1. Environment Tag** (`env:xxx`)
- Based on Dockhand environment name
- Example: `env:prod`, `env:staging`, `env:dev`
- Color: Consistent hash-based color (same algorithm as frontend environment ribbons)

**2. Group Tag** (`group:xxx`) - *Optional*
- Based on `dockhand-tavern.group` label
- Example: `group:Media`, `group:Productivity`
- Color: Consistent hash-based color
- Only added if the label exists on the container

**3. Auto-created Tag** (`dockhand-tavern`)
- Indicates monitor was created automatically by Dockhand Tavern
- Color: Blue (#3b82f6)
- Added to all auto-created monitors

**Tag Colors:**

Tags use the same hash-based color algorithm as the frontend environment ribbons, which:
- Generates one of 8 Catppuccin Mocha colors
- Ensures the same name always gets the same color
- Provides visual consistency across dashboard and Peekaping
- Creates good color distribution

**Example:**

```yaml
# Environment: prod
services:
  nextcloud:
    labels:
      dockhand-tavern.group: "Productivity"
```

Monitor created with 3 tags:
- `env:prod` (consistent color based on "prod" hash)
- `group:Productivity` (consistent color based on "Productivity" hash)
- `dockhand-tavern` (blue)

```yaml
# Environment: staging
services:
  redis:
    # No group label
```

Monitor created with 2 tags:
- `env:staging` (consistent color based on "staging" hash)
- `dockhand-tavern` (blue)

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

In dockhand, create a new apprise notification for `json://YOUR-TAVERN-IP:PORT/webhook` and activiate the triggers in the environment config. 

