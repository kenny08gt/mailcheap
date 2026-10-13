# Automations: design

Date: 2026-10-13. Status: approved.

## Goal

Automated email sequences, like Shopify's marketing automations. A trigger starts a run for a contact, and the run goes through wait and email steps until it finishes or an exit event ends it. The first two flows are:

- **Host activation.** A new Pandy Tickets host gets an onboarding sequence that ends when they publish their first event.
- **Plan checkout dropout.** A host who starts buying a plan and doesn't pay gets reminders that end when they buy.

Both use a new `Pandy Hosts` newsletter (`requireConfirmation: false`). Its consent basis is the host account terms, and every email carries the unsubscribe link.

## Decisions

| Question | Decision |
|---|---|
| Which checkout dropout | Host plan checkout only (`ActivationOrder`). Attendee ticket checkout is out until Pandy collects marketing consent at checkout. |
| Host audience | Separate `Pandy Hosts` newsletter, no confirmation email. |
| Goal | Each automation lists its own exit events. |
| Personalization | Variables filled from the triggering event's properties. No contact-level fields. |
| Engine | Linear step list with a 5-minute tick, not one delayed job per step and not a branching graph. |
| Tick source | systemd timer on the Oracle VM calls a local endpoint. No QStash. |
| Defaults | Emails go to `active` contacts only. One active run per contact per automation. Re-entry is per automation: never, or after N days. |

## Data model

### `Automation` (new)

```
newsletterId   ObjectId, required
name           String
status         "draft" | "active" | "paused", default "draft"
trigger        { event: String }        // "contact_active" or a custom event name
exitOn         [String]                 // event names that end a run
reentry        { allowed: Boolean, cooldownDays: Number }   // allowed false = once per contact ever
steps          [Step]
timestamps
```

Step:

```
{ id: String (stable, generated), type: "wait", hours: Number (> 0) }
{ id: String, type: "email", subject, previewText, html }   // html from the rich editor, same format as rich campaigns
```

### `Enrollment` (new)

```
automationId, newsletterId, contactId   ObjectId, required
status        "active" | "completed" | "exited"
stepId        String: the step to run next
stepIndex     Number: that step's position when saved, used if the step is deleted
nextAt        Date: when the tick should process it
lockedUntil   Date: claim held by a running tick
properties    Mixed: flat object from the triggering event
exitReason    String: event name, "unsubscribed", "bounced", "complained", "dormant", "step-missing"
enrolledAt, endedAt   Date
```

Indexes:

- `{ automationId, contactId }` unique, partial on `status: "active"`. This is the one-live-run rule.
- `{ status, nextAt }`, for the tick's scan.
- `{ contactId, status }`, for exits by event and by contact status.
- `{ automationId, contactId, enrolledAt: -1 }`, for re-entry checks.
- `{ automationId, enrolledAt: -1 }`, for the latest-runs table.

### `Message` (changed)

- `kind` gets `"automation"`.
- New fields: `automationId`, `enrollmentId`, `stepId`.
- Unique partial index `{ enrollmentId, stepId }` where `kind: "automation"`, so a step can't be sent twice.
- Index `{ automationId, stepId, status }` for step reports.

## Run loop

`POST /api/jobs/automations-tick`, authorized by the `Authorization: Bearer $CRON_SECRET` header. Without `CRON_SECRET` set, it answers 503.

1. If sending is off, answer 409 and do nothing.
2. Load the ids of active automations, then claim up to 500 enrollments one at a time: `findOneAndUpdate({ status: "active", automationId: { $in: activeIds }, nextAt <= now, lockedUntil not > now }, { lockedUntil: now + 10 min })`. The scan skips enrollments whose automation is paused or draft; those keep their `nextAt` and run again once the automation is resumed.
3. For each claimed enrollment, call the pure step engine (`lib/automation-steps.js`): `advance({ automation, enrollment, now })` returns `{ emails: [stepId], stepId, nextAt, status }`.
   - It starts at `enrollment.stepId`. An email step queues itself and the engine moves on. A wait step sets `nextAt = now + hours` and stops on the step after it. Past the last step, the run is `completed`.
   - If `stepId` is no longer in the automation (the step was deleted), the run continues from the step that followed it when the run was last saved. It uses the saved `stepIndex` for that; if the index is past the end, the run completes.
4. Insert one `Message` per email step (`kind: "automation"`, status `queued`), ignoring duplicate-key errors. Save the enrollment's new state and release the lock.
5. Send the new Messages with `sendMessageBatch` in the same request. `sendMessageBatch` learns the `automation` kind: the content comes from the automation step with variables filled in, and the contact must be `active`. Messages left `queued` from earlier ticks (throttled or over the cap) are sent again.

The systemd unit `mailcheap-automations.timer` (`OnCalendar=*:0/5`) runs a oneshot service:
`curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3000/api/jobs/automations-tick`, reading the secret from `/etc/mailcheap/mailcheap.env`.

Each tick saves its time and result on a single status document, so the health check can show when the last tick ran.

## Entering and leaving runs

`lib/automations.js` exports:

- `startRuns({ newsletter, contact, event, properties })` starts a run in each active automation of the newsletter whose `trigger.event === event`, when:
  - the contact is `active`,
  - the contact has no active run in that automation (the unique index enforces this; a duplicate-key error means it's skipped),
  - re-entry allows it: `allowed: false` with any earlier enrollment → skip; `allowed: true` with an enrollment younger than `cooldownDays` → skip.
  A new run starts on the first step with `nextAt = now`, so its first email goes out on the next tick.
- `exitRuns({ contactId, event })` sets every active run of the contact whose automation lists `event` in `exitOn` to `exited`, with `exitReason = event`.
- `exitAllRuns({ contactId, reason })` is called wherever a contact leaves `active`: unsubscribe, bounce or complaint handling, dormant from cleanup.

`onContactActive({ newsletter, contact, properties })` takes over the welcome-email branch in three places: `app/archive/actions.js`, `app/confirm/actions.js` and `app/api/v1/contacts/route.js`. It queues the welcome email as before and calls `startRuns` with `event: "contact_active"`. CSV import and manual adds don't call it, so a backfill starts no runs.

## Events API

`POST /api/v1/events`, using the same API keys, `authenticateRequest` and per-key rate limit as `/api/v1/contacts`.

```json
{ "newsletter": "hosts", "email": "ana@x.com", "event": "plan_checkout_started",
  "properties": { "plan": "Pro", "checkout_url": "https://tickets.pandy.cloud/billing/..." } }
```

Validation:

- `event` matches `^[a-z][a-z0-9_]{0,49}$` and is not `contact_active`, which is reserved.
- `properties` is optional and a flat object: at most 20 keys matching `^[a-z][a-z0-9_]{0,39}$`, values that are strings (500 chars max), finite numbers or booleans.

Behavior:

- The contact must already be in the newsletter. Otherwise the answer is `200 { matched: false }`. Events never create contacts.
- `exitRuns` first, then `startRuns`, so an event can end one automation and start another.
- Answer: `{ matched: true, started: [automationId], exited: n }`.

`POST /api/v1/contacts` gets an optional `properties` field, with the same validation, passed to `contact_active` runs.

## Variables

They're allowed in automation email subject, preview text and HTML: `{{key}}` or `{{key|fallback}}`. Keys come from the enrollment's properties, plus the built-in `email`. Variables are filled in before rendering (`lib/automation-variables.js`):

- In text and attributes, the value is HTML-escaped.
- In `href` attributes, the value is used only if it's an `https://` URL; otherwise the fallback is used, and if the fallback isn't an https URL either, the link is removed and its text kept.
- A missing value with no fallback becomes an empty string.
- The existing placeholders (`{{unsubscribe_url}}`, `{{subject}}`, `{{preview_text}}`) are reserved and left alone.

UTM tagging and click tracking run after variables are filled in, so variable links get tagged and tracked.

## Dashboard

Nav gets **Automations**.

- `/automations`: a table with name, newsletter, trigger, status, active / completed / exited counts, and a "New automation" button.
- `/automations/[id]` editor, autosaved:
  - Settings: newsletter (fixed once activated), trigger (`contact_active` or an event name), exit events, re-entry.
  - Steps list: add Wait (hours or days) or Email, reorder, delete. Email steps use `EditorRich` with the newsletter's saved links, button block, banner and the AI assistant. The variable list sits beside the editor.
  - Send test per email step, with sample variable values (`sendTest` gets the filled-in content).
  - Activate / Pause. Activation runs the campaign checks (`getSendProblem`) on every email step, plus at least one email step.
  - Report: per email step, sent / opened / clicked from Messages by `stepId`; below it, the latest 50 enrollments with contact, step, status, exit reason and start time.

## Failures and limits

- Claims with `lockedUntil` prevent double processing when ticks overlap. The Message unique index is a second guard.
- A failed send marks the Message `failed`, and the run has already moved forward. It shows in the step report.
- Throttled sends stay `queued` and the next tick retries them.
- Automation emails count against the per-newsletter 10-minute signup-email cap (`welcomeEmailsPer10Minutes`). Over the cap they stay `queued` for the next tick and the existing cap alert fires.
- If the newsletter's health rules (bounce/complaint) would pause a campaign, the tick pauses that newsletter's automations and sends an alert.
- The health check flags it when no tick has run in 30 minutes.
- Automation emails don't add to `ignoredIssues` (list cleanup counts campaign issues only), but they do update `lastSentAt` and `stats.sent`.

## Testing

`node --test`, new suites:

- `automation-steps.test.mjs`: wait chains, consecutive emails, last step, a live edit that inserts or removes steps, a deleted current step, a zero-step automation.
- `automations.test.mjs`: re-entry never vs. cooldown, the one-active-run rule, exit events, non-active contacts skipped, `contact_active` reserved.
- `automation-variables.test.mjs`: escaping, `href` accepting https only, fallbacks, unknown keys, reserved placeholders untouched.
- `events-api.test.mjs`: event name and property validation.

Live check on the server before turning on the real flows: one test host goes through a dropout automation with 1-minute waits, and `plan_purchased` ends a second run.

## Out of scope (follow-ups)

- **Pandy emitters** (repo `guate-gynae-event`): host account creation → `POST /api/v1/contacts` on `hosts` with `{ name, dashboard_url }`; `event_published`; `plan_checkout_started` with `{ plan, checkout_url }`; `plan_purchased`. Plus a one-time import of existing hosts (CSV, no runs) and unsubscribe sync.
- Attendee ticket checkout dropout. It needs a marketing consent checkbox at checkout first.
- Tags, segments, contact fields, variables in campaigns.
- Branches, A/B tests, send-time windows.
- Time-based triggers such as win-back (no open in N days) or a date property; these can be added as a second trigger kind checked by the same tick.
