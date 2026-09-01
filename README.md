# 9W // CONTROL

Studio Development Console prototype for managing the `jyhome1228-cyber` GitHub workspace.

## Current build

- Dark terminal / developer console UI
- Live public repository index from GitHub REST API
- Repository status based on recent push activity
- Repository search
- Public GitHub activity stream
- `⌘ K` / `Ctrl K` command palette
- Direct repository links
- KST system clock

## Run

This is a dependency-free static build.

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000`.

It can also be served directly with GitHub Pages from the repository root.

## Architecture direction

### Phase 01 — Console shell

- Overview
- Projects
- Repositories
- Activity
- Deployments
- Issues
- Command palette

### Phase 02 — Authenticated GitHub App

The current prototype uses GitHub's public API and therefore only exposes public workspace data. The production version should use a GitHub App rather than embedding a personal access token in the frontend.

Planned authenticated modules:

- Private repositories
- File browser
- File editor
- Branch creation
- Diff / commit
- Pull requests
- Issues
- GitHub Actions runs, jobs and logs
- Failed workflow retry

### Phase 03 — Studio project metadata

GitHub remains the source of truth for code. Separate project metadata can later be stored in Supabase:

- Client / project name
- Production URL
- Figma URL
- Admin URL
- Platform
- Status
- Tags
- Notes

## Visual system

- Background: `#080808`
- Panel: `#0D0D0D`
- Border: `#242424`
- Main text: `#F1F1F1`
- Status colors are reserved for system state only.

The UI intentionally avoids dashboard-card decoration and uses tables, logs, grids and mono typography as the primary visual language.
