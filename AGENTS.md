<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Production server (Oracle)

Mailcheap runs on the Oracle VPS (`ssh Oracle`, Ubuntu 24.04 arm64) behind Caddy at news.pandy.cloud. Since 2026-11-20 the app runs as its own locked-down user, so a bug in the app cannot change its code or reach sudo. Deploys must keep that split.

| What | Owner | Notes |
| --- | --- | --- |
| Code, `/opt/mailcheap` (git checkout, `node_modules`, `.next`) | `ubuntu` | The app user can only read it. |
| Running service, `mailcheap.service` | `mailcheap` | Set by `/etc/systemd/system/mailcheap.service.d/10-own-user.conf` (`ProtectSystem=strict`, `NoNewPrivileges`). Its repo copy is `deploy/systemd/mailcheap.service.d/10-own-user.conf`. It has no sudo. |
| Runtime writes | `mailcheap` | Only `/var/lib/mailcheap` (uploads, `HOME`) and `/opt/mailcheap/.next/cache`. |
| Secrets, `/etc/mailcheap/mailcheap.env` | `root:mailcheap 640` | Edit only with the `sudo mailcheap-set-*-keys` helpers. They keep the owner and mode. |

## Deploy

Run every step as `ubuntu`. Never run them as `mailcheap` or root.

```sh
ssh Oracle 'set -e; cd /opt/mailcheap
git pull --ff-only
npm ci
npm run build
sudo chown -R mailcheap:mailcheap .next/cache   # the build recreates it as ubuntu; the app writes image/fetch cache there
sudo systemctl restart mailcheap
sleep 5; curl -fsS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/login'
```

The `chown` of `.next/cache` is required on every build. Without it, the app keeps serving pages but logs `EACCES` when it tries to cache.

Do not:
- change the drop-in back to `User=ubuntu`;
- make `/opt/mailcheap` writable by `mailcheap`;
- add `/opt/mailcheap` to `ReadWritePaths`.

If a feature needs a new writable path, add only that directory to `ReadWritePaths` in the drop-in and chown only that directory. Then run `sudo systemctl daemon-reload && sudo systemctl restart mailcheap`.

Known limit: Incremental Static Regeneration (ISR) pages, such as `/archive`, write under `.next/server` when they revalidate, and that directory is read-only to the app. If `journalctl -u mailcheap` shows `EACCES` or `EROFS` there, add `/opt/mailcheap/.next/server` to `ReadWritePaths` and chown it to `mailcheap` after each build.
