# The history is a JSON file and one PNG file for each image

Status: accepted.

The history is in `~/.local/share/leike/history.json`. The file has a version number, and the extension writes it atomically (a temporary file and a rename), so a crash does not leave half a file. Each image is in `~/.local/share/leike/images/<id>.png`. The index holds the text entries in full. For an image entry, the index holds the id, which is also the file name, and the width, the height and the size in bytes.

## Consequences

- The history stays after a logout.
- The extension reads the index at enable and does not read an image until the popup shows it.
- A new version of the file format needs a migration in the core serializer.

## Considered Options

- SQLite: GJS has no SQLite binding in GNOME Shell, and a JSON file of 500 entries is small.
- Images as base64 in the JSON file: each write would copy all images again.
