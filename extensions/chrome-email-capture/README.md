# Elegoo Email Capture Chrome Extension

This extension lets the admin page capture Email Love and Email Inspire pages through your own Chrome browser session.

## Install locally

1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select this folder:
   `/Users/ql/Desktop/Lyam2026hz/elegoo-webdesign/extensions/chrome-email-capture`
5. Keep the local app running at `http://localhost:3000`.

## Use

### Capture one Email Love URL

1. Go to `http://localhost:3000/admin`.
2. Paste an Email Love or Email Inspire detail URL into the normal import field.
3. Click `导入`.
4. The admin page asks this extension to open the page in the background, extract title, brand, subject, images, and visible text, then create or update a draft.
5. For Email Inspire detail pages, the extension stitches the left email creative into one long screenshot and saves that as the case screenshot.

### Capture an Email Inspire brand page

1. Open `批量采集` in the admin page.
2. Paste a brand page such as `https://www.emailinspire.com/insta360`.
3. Click `开始采集`.
4. The admin modal shows live progress while the extension scans and captures each email.
5. It skips detail URLs that already exist in the local library.
6. It opens each new detail page, stitches the full email creative, and saves each email as a separate draft.

If the extension is not installed or Chrome cannot open the page, the site falls back to the normal draft import.

After editing this extension, reload it in `chrome://extensions` and refresh the admin page.
