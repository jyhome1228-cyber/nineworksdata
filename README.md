# 9W // CONTROL

Studio Development Console for `jyhome1228-cyber`.

A black developer-style control center that turns GitHub repository data into a studio operations dashboard.

## Current build

The app opens directly into the **Overview Dashboard** and synchronizes public GitHub data at runtime.

### Dashboard
- Repository count
- Active repositories in the last 30 days
- Open item signal from repository metadata
- Language mix
- Recently updated repositories
- Public GitHub event stream
- Repository intelligence
- System/API status
- Terminal-style activity log

### Projects
- Active / Idle / Archived filters
- Repository-backed project list
- Project search
- Repository inspector drawer

### Repositories
- Name / visibility / branch / language
- Open item count
- Last push time
- Direct GitHub link
- On-demand latest commit inspection

### Activity
- Push
- Create / Delete
- Pull Request
- Issue
- Star / Fork
- Release and other public event signals

### Deployments
- On-demand scan of recent GitHub Actions workflow runs
- Status / branch / SHA / updated time

### Issues
- Repository-level open item summary
- On-demand open issue search

### Search / Command
- Local workspace search
- `Cmd/Ctrl + K` command palette
- Quick repository inspector

## GitHub connection

### Phase 01 — current
The browser uses the GitHub **public REST API** for public repository and event data.

No Personal Access Token is embedded in the frontend and no secret is stored in localStorage.

To reduce unauthenticated API usage:
- Core repository/event data is cached in `sessionStorage` for 3 minutes.
- Commit history is fetched only when a repository inspector is opened.
- Issues and Actions are fetched only when requested.

### Phase 02 — authenticated control
Next architecture:

```text
9W // CONTROL
      |
      +-- Frontend
      |
      +-- Server / Edge API
              |
              +-- GitHub App
                    |
                    +-- Private repositories
                    +-- File read/write
                    +-- Commit
                    +-- Branch
                    +-- Pull Request
                    +-- Issues
                    +-- GitHub Actions
                    +-- Webhooks
```

GitHub App credentials must stay server-side. The frontend should never contain an installation token, client secret, or PAT.

## Deployment

`.github/workflows/pages.yml` deploys the static application to GitHub Pages on pushes to `main`.

## Files

```text
index.html                 Application shell / views
style.css                  Console design system / responsive UI
app.js                     Routing / GitHub API / rendering / interaction
.github/workflows/pages.yml GitHub Pages deployment
```

## Design direction

- Background: near-black `#070707`
- Thin grey grid/borders
- Sparse state colors only
- Sans UI + monospace data
- Desktop-first, responsive down to mobile
- Data itself acts as the visual system

---

`9W // CONTROL` / Studio Development System
