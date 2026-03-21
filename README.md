# Lamp (Flask app) + GitHub Pages landing

This repository contains a Flask web app (see [`python app.py`](python%20app.py)) and a static GitHub Pages landing page (see [`index.html`](index.html)).

## GitHub Pages

GitHub Pages can only host static files, so it will serve:

- `index.html`
- `404.html`
- `/static/*` assets

To enable Pages:

1. On GitHub: `Settings` -> `Pages`
2. `Build and deployment`
3. `Source`: `Deploy from a branch`
4. Select your default branch and `/(root)`
5. Save

After it deploys, your site will be available at the URL shown in `Settings` -> `Pages`.

## Run the Flask app locally (Windows PowerShell)

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python "python app.py"
```

Notes:

- Put secrets in environment variables (see [`.env.example`](.env.example)).
- The `users.db` in this repo is a local SQLite file; treat it as development data.
- Authentication is handled by Firebase Auth. Configure Firebase env vars in `.env.example` and enable providers in Firebase Console.

Firebase Admin setup (backend):
- Create `secrets/firebase-service-account.json` (copy from Firebase Console -> Service accounts -> Generate new private key).
- Set `FIREBASE_ADMIN_CREDENTIALS_PATH=secrets/firebase-service-account.json` in `.env`.

## Subscriptions (Free + Pro)

Lamp supports:

- Free plan: up to `FREE_DAILY_MESSAGE_LIMIT` AI messages per day (default: 15)
- Pro plan: Stripe monthly subscription, unlimited AI messages

Enforcement is server-side: every AI request reserves quota on the backend, and Free quota resets automatically each new day (based on user timezone if available, otherwise `USAGE_TZ`).

### Firestore Data Model

If Firebase Admin credentials are configured, billing and usage are stored in Firestore (fallback: SQLite for local dev).

Collection: `billing_users/{firebase_uid}`

Fields:

- `uid` (string)
- `email` (string)
- `plan_type` (string: `free`/`pro`/…)
- `messages_used_today` (number)
- `last_reset_date` (string `YYYY-MM-DD`)
- `subscription_status` (string: Stripe status like `active`, `trialing`, `canceled`, `past_due`, …)
- `stripe_customer_id` (string)
- `stripe_subscription_id` (string)
- `current_period_end_utc` (string ISO)
- `cancel_at_period_end` (bool)
- `created_at_utc` / `updated_at_utc` (string ISO)

### Stripe Setup

1. Create a Stripe subscription product + monthly price in Stripe Dashboard.
2. Set env vars (see [`.env.example`](.env.example)):
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`
   - `STRIPE_PRICE_PRO_MONTHLY`
3. Configure a Stripe webhook endpoint pointing to:
   - `POST /webhooks/stripe`
4. (Recommended) Set `PUBLIC_BASE_URL` in production so Stripe redirects and links are correct behind proxies.

### UI

- Pricing page: `GET /upgrade`
- Billing portal (cancel/update payment method/invoices): button on `/upgrade` (calls Stripe Billing Portal)
- Paywall: shown in `/ai` when Free daily limit is reached
