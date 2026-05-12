# TimeTracking
Project time tracking solution

## Run With Docker

Prerequisites on Debian:

- Docker Engine
- Docker Compose plugin
- A trusted LAN or reverse proxy. The app does not include authentication yet.

Build and start the app:

```bash
docker compose up -d --build
```

Open:

```text
http://localhost:4173
```

Stop it:

```bash
docker compose down
```

View logs:

```bash
docker compose logs -f
```

Restart:

```bash
docker compose restart
```

Update after copying or pulling new files:

```bash
docker compose up -d --build
```

Data is saved on the host in:

```text
./data/state.json
```

If Docker is controlled from inside another container while the Docker daemon runs on the host, set an absolute host-visible data path before starting:

```bash
TIMETRACKING_DATA_DIR=/absolute/host/path/to/data docker compose up -d --build
```

For the OpenClaw workspace setup this can be:

```bash
TIMETRACKING_DATA_DIR=/home/mightyraider/lab/openclaw/workspace/repos/TimeTracking/data docker compose up -d --build
```

Back up that file to preserve all timesheets, projects, subtasks, and monthly entries.

Restore from backup:

```bash
docker compose down
mkdir -p data
cp /path/to/backup-state.json data/state.json
docker compose up -d
```

The app also has export/import controls in the Control Panel tab for browser-driven backups.

The Control Panel supports two file formats:

- JSON export/import: full app backup and restore.
- CSV export/import: active timesheet and selected month only.
- Actual CSV export: selected month with only date, start, end, break, actual hours, and comments.

## Manual Docker Run

```bash
docker build -t timetracking:latest .
docker run -d --name timetracking --restart unless-stopped -p 4173:3000 -v "$PWD/data:/data" timetracking:latest
```
