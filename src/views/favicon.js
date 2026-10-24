/**
 * Favicon for the root status page.
 *
 * The status page is the only HTML document this API serves, and browsers request a
 * favicon for it. Without one the preview logs a 404 for /favicon.ico. The mark is a
 * warning triangle, inlined as SVG so it needs no binary asset in the repo.
 */
export const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="7" fill="#111827"/>
  <path d="M16 6.5 27 26H5z" fill="#f59e0b"/>
  <rect x="15" y="13" width="2" height="7" rx="1" fill="#111827"/>
  <rect x="15" y="22" width="2" height="2" rx="1" fill="#111827"/>
</svg>
`;
