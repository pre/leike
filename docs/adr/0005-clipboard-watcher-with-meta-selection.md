# The clipboard watcher uses Meta.Selection

Status: accepted.

The extension connects to the `owner-changed` signal of `Meta.Selection` for the clipboard. At each change it reads the content with `St.Clipboard.get_content()`, as text or as `image/png`. When the user selects an entry in the popup, the extension writes the content with `St.Clipboard.set_content()`. That write also gives an `owner-changed` signal, so the extension ignores the changes that it makes itself.

## Considered Options

- Poll the clipboard with a timer: it uses CPU when nothing changes, and it does not see a change that is shorter than the interval.
