# Clever Finds Instagram

Independent official Instagram Login adapter. Nothing here changes Pinterest selection, gates, production RSS or its 15:00/19:00/22:00 Asia/Riyadh schedule.

## Current state

NOT_CONFIGURED until a real Professional account is authorised. Dry runs never call media_publish. No password, browser automation, scraped analytics, listing video or commercial music.

## One-time account connection

1. Create/switch an Instagram account to Business or Creator, named Clever Finds, using the existing Clever Finds logo.
2. Suggested bio (under 150 characters): “Smart storage for small UK homes. Kitchen, wardrobe & bathroom finds. Renter-friendly ideas. Ad / affiliate links ↓”
3. Website: https://cleverfindspicks.github.io/instagram/?utm_source=instagram&utm_medium=organic&utm_campaign=clever_finds
4. In Meta for Developers create/configure an app with Instagram API **Instagram Login**, add the Professional account and authorise it through Meta's consent flow. A Facebook Page is not required for this login mode. Request basic/content publishing; insights access is optional and depends on Meta permission approval.
5. Run `pnpm instagram:connect` locally. Enter app secret and the dashboard-generated authorised short-lived token into the hidden prompts, never into chat or command arguments. The CLI exchanges it officially, checks account identity, and writes ignored private local credentials.
6. Run `pnpm instagram:health`. Expired access requires new consent; eligible long-lived tokens are refreshed before expiry. Unsupported metrics remain Unknown.

## Worker and safeguards

`pnpm instagram:run` checks Europe/London 19:30 (DST-aware), maximum one Reel per day; pending retries can run outside the selection slot. This is a local worker: the PC must be powered on and its scheduler available. No always-on cloud service is claimed.

Scheduler registration is pending: this conversation already has the unchanged Pinterest heartbeat, and the app allows only one heartbeat per conversation. Do not replace it or create a workaround scheduler. A separate user-approved task is required to attach the Instagram worker.

Qualified existing Product Intelligence receipts are scored independently for Instagram suitability. Selection never rewrites the original score. Actual original product pixels are mechanically contained in four honest scenes; MP4 1080×1920, 30fps, 12 seconds, silent, with upfront Ad/affiliate disclosure. Local and publicly served media hashes, fidelity evidence and actual affiliate destination must pass before publication.

SQLite queue stores stable IDs, containers, media IDs, retries and publication uncertainty. Lost publication replies require reconciliation before any new publish attempt. Actual published entries only are exported to /instagram; preview fixtures are not production posts.

## Data

Additive SQLite migration first backs up the existing performance.sqlite under ignored .local/backups. New tables are instagram_*; Pinterest records and calculations remain separate. Tokens, originals, scenes, DBs and private reports never enter Pages or Git.

`pnpm instagram:sync` imports only metrics actually returned by the official API. `pnpm instagram:import media|site|orders FILE.json` supports manual verified exports. Orders require a known Instagram tracking ID and matching product ID; product identity alone is not platform attribution. Existing AliExpress links and Tracking ID are unchanged. Missing affiliate sub-ID reporting cannot magically attribute orders.

Cluster feedback stays neutral until 5 posts, 3,000 views and 25 attributed visits; likes alone never imply sales. Lifetime media snapshots are not summed as daily views. Period earnings and lifetime views are not used to invent EPMI. Cross-platform commerce deduplicates external order/product IDs.

## Verification

`pnpm instagram:test`, `pnpm performance:test`, `pnpm intelligence:test`, `pnpm build`, `pnpm intelligence:validate`.

Official references: https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api and https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/content-publishing . Disclosure: https://www.asa.org.uk/advice-online/affiliate-marketing.html
