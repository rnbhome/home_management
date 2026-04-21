# Home Manager

A tiny home-chore tracker that uses **this GitHub repo itself as the database**.
No backend, no hosting account, no database — `data/state.json` is the source of
truth, and the app reads/writes it via the GitHub Contents API.

## What it does

- **Tasks** — per-room chores with a due date, a recurrence (`1w`, `2w`, `1m`,
  …), and an optional note. Tick one and its next due date is scheduled
  automatically.
- **Frequencies** — quickly change how often each task recurs.
- **Task List** — generate a shareable text summary (WhatsApp-friendly) of
  what's urgent today, with built-in day-shift phrases like "tomorrow" or
  "in 2 days".
- **🗑️ Bins** — upcoming rubbish collections grouped by month, with chip colours
  per bin. Reminds you the day before a collection inside the Task List.

Every change is a GitHub commit, so your edit history is your audit log.

## Setup

### 1. Create a GitHub Personal Access Token

1. Open [github.com/settings/tokens?type=beta](https://github.com/settings/tokens?type=beta)
2. **Generate new token → Fine-grained personal access token**
3. Name: `home-manager-app`
4. Expiration: 1 year (or "No expiration")
5. Repository access: **Only select repositories** → `home_management`
6. Permissions → Repository → **Contents: Read and write**
7. **Generate token** and copy it (it starts with `github_pat_…`)

### 2. Enable GitHub Pages

1. Go to this repo → **Settings → Pages**
2. Source: **GitHub Actions**
3. Push any commit to `main`; the `Deploy` workflow will publish the site to
   `https://rnbatra.github.io/home_management/`.

### 3. First launch

1. Open the URL above in Safari on your iPhone (or any browser).
2. Paste your PAT — it's saved to `localStorage`, you won't need to paste it
   again on that device.
3. On iPhone: **Share → Add to Home Screen** to install as a PWA.

That's it. Every tick / unlock / frequency change is saved to
`data/state.json` in this repo within ~1 second.

## Layout

```
.
├── data/state.json         # the database (app writes to this)
├── public/                 # PWA manifest + icons
├── src/
│   ├── App.jsx             # all 4 tabs
│   ├── github.js           # Contents API wrapper
│   ├── constants.js        # freq map, room order, bin styles
│   ├── styles.css
│   └── main.jsx
├── index.html
├── vite.config.js          # base: '/home_management/'
└── .github/workflows/deploy.yml
```

`deploy.yml` sets `paths-ignore: ['data/**']`, so state updates don't trigger
rebuilds.

## Local development

```sh
npm install
npm run dev       # starts Vite on localhost:5173
npm run build     # produces dist/
```
