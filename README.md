# AttendTrack

AttendTrack is a personal college attendance tracker built with React, TypeScript, and Vite. It works without an account or backend. Subjects, opening counts, history, and theme are stored in the current browser using `attendtrack.v1` and `attendtrack.theme`.

## Run, test, and build

```powershell
npm ci
npm run dev
npm test
npm run build
```

Open the local URL printed by Vite, usually `http://localhost:5173/`. The production site is written to `dist/`.

## Data and backups

Use **Back up data** to download a JSON file containing subjects, opening counts, history, and theme. **Restore backup** validates the full file and previews its contents before asking to replace the current browser data. Keep the backup file private; it contains the complete personal attendance history. Data does not sync between browsers or devices unless the student transfers a backup.

Older records are migrated from the existing storage keys. When legacy history cannot be matched to exactly one subject, the event and counts are preserved without assigning it to a guessed subject.

## Publish updates on GitHub Pages

The included GitHub Actions workflow runs `npm ci`, `npm test`, and a production build after each push to `main`, then publishes `dist/` to GitHub Pages. The Vite `ghpages` mode builds with the `/attendtrack/` project path.

For the requested clean URL, create a **public** repository named `attendtrack` in the GitHub account you control, connect this folder once, and enable Pages from **Settings → Pages → Build and deployment → GitHub Actions**:

```powershell
git remote add origin https://github.com/anurag-501/attendtrack.git
git branch -M main
git add .
git commit -m "Deploy AttendTrack"
git push -u origin main
```

If a remote is already configured, keep it and push `main` instead of adding another remote. Future updates use:

```powershell
git add .
git commit -m "Update AttendTrack"
git push
```

Once GitHub finishes the first Pages deployment, the project URL is `https://anurag-501.github.io/attendtrack/`. GitHub Pages on a free account requires a public source repository, so the application source will be public. Hosting is subject to GitHub account and Pages availability; there is no custom-domain renewal fee. The existing public Site remains available at `https://attendtrack-college-student.sunnyactor4.chatgpt.site/` for transfers until the clean URL is verified and the legacy-site notice is published.
