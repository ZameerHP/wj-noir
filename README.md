# WJ NOIR — Luxury fragrance website

A complete, responsive, zero-dependency front-end website inspired by the editorial layout of the supplied WBD Fragrance reference. It is built using semantic HTML, CSS and vanilla JavaScript, so it runs immediately without npm or a build step.

## Start locally

From this folder, run:

```bash
python -m http.server 8080
```

Open `http://localhost:8080` in your browser for a static storefront preview. Do not double-click `index.html` directly because `/assets` paths expect a web server. To test checkout and the admin dashboard against Supabase locally, use `vercel dev` as described below so the `/api/config` function is available.

## Deploy to Vercel

Import this folder as a new Vercel project. Set **Framework Preset: Other**, leave **Build Command** empty, and set **Output Directory** to `.`. `vercel.json` is included. A different static host can serve the storefront, but its serverless environment/config route and clean-route rewrites must also be configured for checkout and `/admin`.

## Hero video — YOUR ACTUAL UPLOADED FOOTAGE

* `assets/the-office-original.mov` is the **original, completely unmodified** uploaded video.
* `assets/the-office-hero.mp4` is the **same video**, with only the black bars baked into the portrait upload removed. It is encoded in H.264 for browser compatibility at the original 24 fps, original length and normal playback speed. Its scenes and animation have **not** been regenerated.
* `assets/the-office-poster.jpg` is a real frame extracted from your video, so the hero still looks correct while it loads.

Video autoplays **muted** on standard connections because browsers block unmuted autoplay. There is no sound toggle. It stays paused when reduced motion or data saver is enabled, and automatically loops when playing.

## Included pages and interactions

- Homepage: full-screen The Office video campaign with an overlay navigation, editorial headline and collection calls to action, followed by the manifesto, a three-card "Most Wanted" section featuring the supplied The Office, Ice Desire and Lévoria product photographs, dark-rock collection banner, editorial sections, brand statement and footer.
- The supplied WJ NOIR logo artwork is used in the site header, loading screen, footer and favicon, with its background made transparent for clean placement.
- Product photos use compressed JPEG versions that are about 90% smaller than the original PNGs. Supporting imagery loads lazily, and product films wait until they are near the viewport.
- Collection (`#/shop`): all three fragrances.
- Brand story (`#/about`).
- Separate fragrance pages (`#/fragrance/the-office`, `#/fragrance/ice-desire`, `#/fragrance/levoria`) with four-image galleries; The Office and Ice Desire each use their original product image plus three supplied photos. Pages also include a short looping fragrance film, quantity-aware cart controls, and expandable fragrance stories and notes.
- Mobile menu, live search by fragrance or notes, responsive layout, scroll reveals and motion-reduced accessibility.
- Persistent shopping cart, slide-out drawer, quantity editing, removal, subtotal, checkout, and Buy Now.
- Validated Cash on Delivery checkout, server-priced order submission, order confirmation, and protected `/admin` order management.

## Ordering system setup

The storefront includes a local-storage cart, quantity controls, Buy Now checkout, validated Cash on Delivery form, order confirmation, and an admin orders dashboard. Open the admin sign-in by clicking the footer logo five times within two seconds; authorized admin sign-in is still required. Supabase is the source of truth for accepted orders and prices. The order-creation RPC accepts only the three catalog products and calculates prices on the database; the browser cannot read customer orders. This project does not collect online card payments or calculate shipping.

### 1. Create and configure Supabase

1. Create a Supabase project and copy its project URL, public anon key, and **legacy** `service_role` key from **Project Settings → API**. The service-role key is server-only.
2. Enable the Supabase `pg_net` and Vault extensions if they are not already enabled.
3. In **SQL Editor**, run [`supabase/migrations/202604180001_ordering.sql`](./supabase/migrations/202604180001_ordering.sql).
   - The migration allowlists `wjnoir@gmail.com`, the email already supplied for WJ NOIR. If another address should administer orders, change that email in the migration before running it or update the `admin_allowlist` row afterward.
   - Orders and items have RLS enabled. Anonymous visitors can create orders only through the validated `create_order` RPC; they cannot read, update, or delete orders. Only authenticated allowlisted admins can read or update them.
   The migration uses Vault secrets and `net.http_post` for the post-insert email notification.
4. In **Authentication → Users**, create the allowlisted admin account yourself and set its password. Disable public signups in the Supabase Auth settings; the storefront has no signup page.

### 2. Verify the Resend sending domain

Add and verify your sending domain in Resend, including the DNS records Resend provides. Choose a sender address on that verified domain, for example `WJ NOIR <orders@your-domain.com>`. Copy the Resend API key; it is never used in the browser.

### 3. Deploy the email function and configure its secrets

Install and authenticate the Supabase CLI, link this project, and deploy the function with gateway JWT verification disabled. The function independently checks the exact server-only service-role bearer secret set below:

```powershell
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy send-order-email --no-verify-jwt
supabase secrets set --project-ref YOUR_PROJECT_REF SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co SUPABASE_SERVICE_ROLE_KEY=YOUR_LEGACY_SERVICE_ROLE_KEY RESEND_API_KEY=YOUR_RESEND_API_KEY ADMIN_EMAIL=wjnoir@gmail.com FROM_EMAIL='WJ NOIR <orders@your-verified-domain.com>' SITE_URL=https://your-storefront-domain.com
```

In the Supabase **SQL Editor**, store the Edge Function endpoint and service-role key in Vault so the database trigger can invoke it. Replace the placeholders directly in the SQL editor; do not save real keys in this repository:

```sql
select vault.create_secret(
  'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-order-email',
  'order_email_function_url',
  'WJ NOIR order email Edge Function endpoint'
);

select vault.create_secret(
  'YOUR_LEGACY_SERVICE_ROLE_KEY',
  'order_email_service_role_key',
  'Server-only authorization for the WJ NOIR order email function'
);
```

The trigger queues email delivery after an order is committed. If Resend is unavailable, the saved order remains intact and the function logs the delivery failure.

### 4. Configure and deploy the storefront

Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` in the Vercel project environment variables for each deployment environment. The `/api/config` function exposes only those two public values. Do not add the service-role key or Resend key to Vercel frontend variables or browser files. [`.env.example`](./.env.example) lists the expected names; keep actual credentials in deployment secret stores.

Deploy the project to Vercel with **Framework Preset: Other**, no build command, and `.` as the output directory. The configured rewrites make `/checkout`, `/order-confirmed`, and `/admin` available as direct routes. For local commerce testing, link the project to Vercel, set/pull the public Supabase variables, then run `vercel dev`; the Python static preview does not provide the `/api/config` serverless endpoint.

### 5. Verify the order flow

Test a product page → Add to Cart → cart quantity/remove controls → Checkout → order confirmation. Also test Buy Now to confirm only the selected product is checked out. Confirm the order appears in `/admin`, test search/status updates with the allowlisted user, and verify both Resend messages. A real end-to-end test requires your Supabase project, deployed function, Resend key, and verified sending domain.

Update text, product photos and pricing when you have new official product assets. The Office displays PKR 3,000; Ice Desire and Lévoria display PKR 2,500 each. Inventory and online card payments are not configured. Newsletter subscription remains preview-only.

Your supplied original photographs showed The Office with bergamot / lavender / woody, and Lévoria with vanilla / fruity / woody notes. Ice Desire's specific notes were not supplied, so its page uses sensory descriptions instead of fabricated ingredients.

The design is *inspired by* the reference site's editorial composition. It uses your own WJ NOIR imagery and copy instead of copying its logo, product assets or site code.
