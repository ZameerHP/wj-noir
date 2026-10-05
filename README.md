# WJ NOIR — Luxury fragrance website

A complete, responsive, zero-dependency front-end website inspired by the editorial layout of the supplied WBD Fragrance reference. It is built using semantic HTML, CSS and vanilla JavaScript, so it runs immediately without npm or a build step.

## Start locally

From this folder, run:

```bash
python -m http.server 8080
```

Open `http://localhost:8080` in your browser. Do not double-click `index.html` directly because `/assets` paths expect a web server.

## Deploy to Vercel

Import this folder as a new Vercel project. Set **Framework Preset: Other**, leave **Build Command** empty, and set **Output Directory** to `.`. You can also upload the entire folder to any static host. `vercel.json` is included.

## Hero video — YOUR ACTUAL UPLOADED FOOTAGE

* `assets/the-office-original.mov` is the **original, completely unmodified** uploaded video.
* `assets/the-office-hero.mp4` is the **same video**, with only the black bars baked into the portrait upload removed. It is encoded in H.264 for browser compatibility at the original 24 fps, original length and normal playback speed. Its scenes and animation have **not** been regenerated.
* `assets/the-office-poster.jpg` is a real frame extracted from your video, so the hero still looks correct while it loads.

Video autoplays **muted** because browsers block unmuted autoplay. Visitors can use the sound toggle if their browser supports audio. The video automatically loops.

## Included pages and interactions

- Homepage: full-screen The Office video campaign with an overlay navigation, editorial headline and collection calls to action, followed by the manifesto, a three-card "Most Wanted" section featuring the supplied The Office, Ice Desire and Lévoria product photographs, dark-rock collection banner, editorial sections, brand statement and footer.
- The supplied WJ NOIR logo artwork is used in the site header, loading screen, footer and favicon, with its background made transparent for clean placement.
- Collection (`#/shop`): all three fragrances.
- Brand story (`#/about`).
- Separate fragrance pages (`#/fragrance/the-office`, `#/fragrance/ice-desire`, `#/fragrance/levoria`) with four-image galleries; The Office and Ice Desire each use their original product image plus three supplied photos. Pages also include a short looping fragrance film, quantity-aware selection controls, and expandable fragrance stories and notes.
- Mobile menu, live search by fragrance or notes, responsive layout, scroll reveals and motion-reduced accessibility.
- Working local 'My Selection' drawer using browser local storage, with a button to copy the selected fragrances.

## Before going live

**This is a complete visual/front-end website, not a connected commerce backend.** The Office displays PKR 3,000; Ice Desire and Lévoria display PKR 2,500 each. Inventory, payment checkout, shipping, order email and newsletter subscription are not configured. The buy buttons add the requested quantity to a personal selection shortlist; the selection drawer clearly explains that this is not a checkout. The newsletter explicitly explains that a service must be connected instead of pretending to save subscribers.

Update text, product photos and pricing if you get new official product assets. Your supplied original photographs showed The Office with bergamot / lavender / woody, and Lévoria with vanilla / fruity / woody notes. Ice Desire's specific notes were not supplied, so its page uses sensory descriptions instead of fabricated ingredients.

The design is *inspired by* the reference site's editorial composition. It uses your own WJ NOIR imagery and copy instead of copying its logo, product assets or site code.
