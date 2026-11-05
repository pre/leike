# Entry types: text, image, link, color and file

Status: accepted.

Each entry has one type: `text`, `image`, `link`, `color` or `file`. An image is a clipboard change with `image/png`. Link, color and file are classifications of text: a URL, a hex color such as `#RRGGBB`, and a `text/uri-list`. The type gives the type filter and the preview in the popup, as in Raycast. The core classifies the text, so the classification is the same on each platform.

## Consequences

- A link, color or file entry keeps its text, so a paste gives the same text that the user copied.
- Rich text (`text/html`) and entries with more than one mime type are not in version 1.
