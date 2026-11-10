# Entry types: text, image, link, color and file

Status: accepted.

Each entry has one type: `text`, `image`, `link`, `color` or `file`. An image is a clipboard change with `image/png`. One exception: when the change also offers `text/html` and a plain text type, the entry is the text. A spreadsheet and a document offer their text in these two forms, and `image/png` is then a picture of that text. An image copy does not offer both: a browser offers `text/html` and no plain text, and an image viewer offers the file path as plain text and no `text/html`. Link, color and file are classifications of text: a URL, a hex color such as `#RRGGBB`, and a `text/uri-list`. The type gives the type filter and the preview in the popup, as in Raycast. The core classifies the text, so the classification is the same on each platform.

## Consequences

- A link, color or file entry keeps its text, so a paste gives the same text that the user copied.
- Rich text (`text/html`) and entries with more than one mime type are not in version 1.
