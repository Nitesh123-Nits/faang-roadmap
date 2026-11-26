# FAANG Run

A personal tracker for FAANG-style interview preparation: a customisable roadmap, progress tracking and light/dark mode. Static site with no build step; it works offline once installed.

## Run locally

```bash
python3 -m http.server 8080   # then open http://localhost:8080
```

## Deploy

GitHub Pages: Settings → Pages → Deploy from branch → `main` / root.

## Daily habit: streak, XP goal and reminders

`engage.js` adds a streak chip in the header, a daily XP goal, streak freezes, levels and reminders. Ticking a task (10 XP), solving a problem (15), mastering a pattern (20), finishing a study guide (20) or a daily-log item (10) earns XP. Tap the flame to set the goal and reminder time, enable notifications, or add a daily calendar reminder. Notifications are local (no server); the calendar reminder is the reliable option. Your streak is included in Export backup.
