# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems.
Use GitHub's private reporting instead: **Security → Report a vulnerability** on this repository.

Include what you found, how to reproduce it and the impact you expect.
I'll acknowledge the report as soon as I can and keep you updated on the fix.

## Supported versions

Only the latest release on the `main` branch receives fixes.

## Threat model

The extension replaces the browser's new tab page and runs entirely on the user's computer.
There is no server, no account and no analytics.

| Asset | Threat | Mitigation |
|---|---|---|
| Notes in the Obsidian vault | A note containing malicious HTML/Markdown (e.g. text pasted from the web) runs script in the extension page | Markdown rendered with marked, then sanitised by DOMPurify (returned as DOM nodes, no HTML strings reparsed). Forms, frames, SVG, MathML, media and inline styles are removed. `javascript:` and unknown URL schemes are stripped from links. Strict CSP (`script-src 'self'`) as a second layer |
| Privacy while reading notes | Remote images in a note act as tracking pixels | Remote images are blocked by default (`reader.loadRemoteImages`). Their address is removed during sanitisation, so the browser never starts the request |
| Vault contents | Data leaving the computer | The vault is read with the File System Access API in **read-only** mode. The cached index stores only paths, dates, tags and links, never note text. No network request contains vault data |
| Browsing | Over-broad permissions | No host permissions at install time. Feed sites are requested at runtime (`optional_host_permissions`), one origin per configured feed, and can be revoked from the extension's details page. Feeds are fetched without cookies (`credentials: "omit"`) |
| News feeds | Malicious feed content (XSS, `javascript:` links) | Titles are reduced to plain text with an inert `DOMParser` document. Only `http(s)` links are kept, and the check is repeated on cached data. All DOM is built with `textContent`, never `innerHTML` |
| Bookmarks | A `javascript:`/`data:` bookmark turning into code execution | Only `https://`, `http://` and `obsidian://` URLs are accepted, both when added and when loaded from storage |
| Supply chain | Tampered or outdated third-party code | Libraries and fonts are vendored from pinned npm versions by a script, with SHA-256 checksums. CI fails if a vendored file differs from the pinned package. Dependabot proposes updates. GitHub Actions are pinned to commit SHAs |
| Repository | Secrets or personal data committed by mistake | `config.local.json` and secret file types are git-ignored, CI fails if a personal config file is tracked, and gitleaks scans the full history on every push |
| Third-party requests | Fonts loaded from a CDN on every new tab | Fonts are bundled with the extension (`font-src 'self'`) |

### Content Security Policy

```
default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none';
form-action 'none'; frame-ancestors 'none'; style-src 'self'; font-src 'self';
img-src 'self' blob: data: https:; connect-src 'self' https:
```

`img-src https:` is only used when remote images are explicitly enabled. `connect-src https:` is needed to download feeds, and is further limited by the host permissions the user grants.

### Out of scope

- A compromised browser, operating system or Obsidian installation.
- Content that the user deliberately allows (remote images, extra feed sites).
- Websites opened from bookmarks, search or news links.
