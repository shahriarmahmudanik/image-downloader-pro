# Chrome Web Store listing

**Name:** Image Downloader Pro


**Summary (max 132 chars):** Find every image on a web page, pick the ones you want, and download them in one click.

**Category:** Productivity

**Description:**
Image Downloader scans the page you are on and shows every image in a thumbnail grid. Click the ones you want, then download them all at once.

- Finds <img> tags (including the largest srcset version and lazy-loaded images), <picture> sources, CSS background images, SVG files, icons and og:image
- Filter by minimum size and file type (JPG, PNG, WebP, GIF, SVG)
- Select all / none
- Saves to Downloads/<site-name>/image-001.jpg and so on
- No account, no tracking, no data leaves your browser

**Single purpose:** Let the user find and download images from the web page they are viewing.

## Permission justifications
- **activeTab:** Grants temporary access to the current tab only when the user clicks the extension icon, so it can read the image URLs on that page.
- **scripting:** Runs the image-scanning function in the active tab to collect image URLs and sizes.
- **downloads:** Saves the images the user selected to their Downloads folder.

## Privacy practices tab
Leave all data-collection boxes unchecked. The extension collects, stores and transmits nothing. Certify the three Limited Use statements.

## You must do yourself
1. Host PRIVACY.md it at a public URL (e.g. GitHub Pages).
2. Register at the Chrome Web Store Developer Dashboard ($5 one-time, 2-step verification on).
3. Set developer name and verified contact email in the Account tab.
4. Take 1–5 screenshots (1280×800) of the popup on an image-heavy page.
5. Upload image-downloader-store.zip, paste this text, add the privacy URL, submit.
