# Deploying this to Vercel — Full Guide

This folder is a ready-to-deploy Vercel project. It contains ONE file
that matters: `api/order-lookup.js` — your order-tracking backend.

Pick ONE of the two methods below.

═══════════════════════════════════════════════════════════════════
METHOD A — Using Vercel CLI (recommended, ~5 minutes)
═══════════════════════════════════════════════════════════════════

You'll need Node.js installed. If you've used Shopify CLI before,
you already have it.

### Step 1 — Open a terminal in this folder

Unzip this file, then open terminal/command prompt and navigate
into the unzipped folder:

```bash
cd path/to/vercel-project
```

### Step 2 — Install the Vercel CLI (one-time)

```bash
npm install -g vercel
```

### Step 3 — Log in to Vercel

```bash
vercel login
```

This opens your browser — sign up/log in with email or GitHub (free).

### Step 4 — Deploy

```bash
vercel
```

It will ask a few questions — just press Enter to accept defaults
for all of them:

```
? Set up and deploy "~/vercel-project"?  → Yes (press Enter)
? Which scope?                            → (your account, press Enter)
? Link to existing project?               → No
? What's your project's name?             → watch-order-tracker (or press Enter)
? In which directory is your code located? → ./ (press Enter)
```

After ~30 seconds, it gives you a URL like:
```
https://watch-order-tracker-xxxx.vercel.app
```

This is a PREVIEW url. To get your permanent production URL, run:

```bash
vercel --prod
```

This gives you your final URL, e.g.:
```
https://watch-order-tracker.vercel.app
```

Your API endpoint is then:
```
https://watch-order-tracker.vercel.app/api/order-lookup
```

### Step 5 — Add environment variables

```bash
vercel env add SHOPIFY_STORE
```
→ paste: `medallion-9178.myshopify.com` → select "Production"

```bash
vercel env add SHOPIFY_CLIENT_ID
```
→ paste your Client ID → select "Production"

```bash
vercel env add SHOPIFY_CLIENT_SECRET
```
→ paste your Client Secret → select "Production"

### Step 6 — Redeploy so env vars take effect

```bash
vercel --prod
```


═══════════════════════════════════════════════════════════════════
METHOD B — Using Vercel Dashboard (browser only, no terminal)
═══════════════════════════════════════════════════════════════════

### Step 1 — Create a GitHub repo with these files

1. Go to github.com → sign up free if needed
2. Click "+" (top right) → "New repository"
3. Name it `watch-order-tracker` → Create repository
4. Click "uploading an existing file"
5. Drag in ALL files from this folder (keeping the `api/` folder structure —
   GitHub lets you drag a folder and it preserves the path)
6. Commit the files

### Step 2 — Import into Vercel

1. Go to vercel.com → sign up/log in with your GitHub account
2. Click "Add New" → "Project"
3. Find your `watch-order-tracker` repo → click "Import"
4. Leave all settings as default → click "Deploy"
5. Wait ~30 seconds → you'll get your URL:
   `https://watch-order-tracker.vercel.app`

### Step 3 — Add environment variables

1. In your Vercel project → click "Settings" tab
2. Click "Environment Variables" in the left menu
3. Add each of these one at a time (Key → Value → Save):

   | Key | Value |
   |---|---|
   | SHOPIFY_STORE | medallion-9178.myshopify.com |
   | SHOPIFY_CLIENT_ID | (your Client ID) |
   | SHOPIFY_CLIENT_SECRET | (your Client Secret) |

### Step 4 — Redeploy

1. Click "Deployments" tab
2. Click the "..." (three dots) on the most recent deployment
3. Click "Redeploy" → confirm


═══════════════════════════════════════════════════════════════════
AFTER DEPLOYMENT — Final steps
═══════════════════════════════════════════════════════════════════

1. Your API endpoint is:
   `https://YOUR-PROJECT-NAME.vercel.app/api/order-lookup`

2. Open `api/order-lookup.js` and update this line with your store URL:
   ```js
   res.setHeader('Access-Control-Allow-Origin', 'https://YOUR-STORE.myshopify.com');
   ```
   (then redeploy if using CLI: `vercel --prod`,
    or if using GitHub: commit the change and Vercel auto-redeploys)

3. In your Shopify theme, open `page.track-order.liquid` and update:
   ```js
   const API_ENDPOINT = 'https://YOUR-PROJECT-NAME.vercel.app/api/order-lookup';
   ```

4. Test by visiting `/pages/track-order` on your store and entering
   a real order number + email.


═══════════════════════════════════════════════════════════════════
QUICK TEST — Check your API works on its own
═══════════════════════════════════════════════════════════════════

Before testing on Shopify, you can check the API directly in your
browser. Visit:

```
https://YOUR-PROJECT-NAME.vercel.app/api/order-lookup?order_id=1001&email=test@example.com
```

(replace 1001 with a real order number and the matching email)

- If you see JSON with order_date, order_name etc → it's working!
- If you see {"error": "..."} → read the error message, it tells
  you what's wrong (auth issue, order not found, etc.)
- If you see a server crash/500 → check your environment variables
  are spelled exactly right with no extra spaces
