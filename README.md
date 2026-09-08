# iPOS — Windows desktop app

## Easiest path: build it in the cloud, no Node.js needed anywhere

If none of your computers have Node.js installed, you don't need to install
it at all. This project includes a GitHub Actions workflow that builds the
Windows `.exe` for you on GitHub's own servers.

1. Make a free account at [github.com](https://github.com) if you don't
   have one.
2. Create a new repository (any name, e.g. `ipos`) and upload the contents
   of this folder to it (drag-and-drop works on github.com — no `git`
   command needed, use "Add file → Upload files").
3. Click the **Actions** tab on your repository, choose **Build Windows
   app**, then click **Run workflow**. (It also runs automatically
   whenever you upload/push changes.)
4. Wait a couple of minutes for it to finish (green check ✓).
5. Open the finished run, scroll to **Artifacts**, and download
   **iPOS-windows** — a zip containing the installer and portable `.exe`.
6. Copy those `.exe` files onto a USB stick and run them on any shop PC —
   no Node.js, no internet, no setup on that machine. Just double-click.

Everything below describes building it manually instead, if you'd rather
use a Windows PC directly.


This folder is a ready-to-build Electron project. It wraps the same offline
POS you already have — nothing calls the internet; all data lives in the
app's local IndexedDB storage, so it works fine on shop PCs with no wifi.

Electron is pinned to **v22**, the last major version that still runs on
**Windows 7 and 8** (newer Electron only supports Windows 10/11). The
resulting app works on Windows 7 SP1, 8, 8.1, 10, and 11.

## What you need

- A Windows PC (10 or 11 is easiest) with internet access, just for building.
- [Node.js LTS](https://nodejs.org) installed (v18 recommended).
- You only need to build once — the output `.exe` files themselves need no
  internet and can be copied to any Windows 7–11 machine, including ones
  with no network at all.

## Build steps

Open Command Prompt / PowerShell in this folder, then run:

```
npm install
npm run dist
```

This will:
1. Build the app with Vite (`dist/` folder).
2. Package it with electron-builder for Windows.

When it finishes, look in the `release/` folder for:

- **`iPOS Setup 1.0.0.exe`** — a normal Windows installer (creates a Start
  Menu and Desktop shortcut). This is what most stores should use.
- **`iPOS 1.0.0.exe`** (portable) — a single file that runs without
  installing, useful for USB-stick deployment across several shop PCs.

Copy either file to the target computer and run it — no internet, no
Node.js, and no other software needed on that machine.

## If you only have a Mac or Linux machine to build on

`electron-builder` can still produce a Windows build from Mac/Linux, but it
needs [Wine](https://www.winehq.org) installed for the NSIS installer step.
The portable target usually works without Wine:

```
npm install
npm run build
npx electron-builder --win portable
```

## Re-running the setup wizard / resetting data

These are unchanged from the browser version — inside the app go to
**Settings → Business setup → Run setup wizard again**, or use **Advanced →
Reset business data** if you need a clean slate on a given machine.

## Project layout

```
electron/main.cjs   → Electron main process (opens the window)
src/App.jsx          → The full POS application (React)
src/main.jsx          → Mounts the app
index.html            → Vite entry HTML
```
