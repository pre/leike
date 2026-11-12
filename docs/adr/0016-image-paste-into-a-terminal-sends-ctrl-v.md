# An image paste into a terminal sends Ctrl+V

Status: accepted. This ADR changes one case of ADR-0004: a paste into a terminal when the clipboard has an image.

A terminal gets Ctrl+Shift+V for a paste (ADR-0004). The paste of a terminal gives only text, so Ctrl+Shift+V does nothing when the clipboard has an image. Some programs that run in a terminal accept images. Such a program reads the image from the clipboard itself when it gets Ctrl+V, which the terminal sends to it as the byte 0x16.

So when the clipboard has an image, paste sends Ctrl+V also to a terminal. A text paste into a terminal still gets Ctrl+Shift+V, other windows still get Ctrl+V, and copy and cut do not change. There is no setting for this.

- `keysFor` in the core takes the kind of the clipboard content, `image` or `text`. It stays a pure data transform (ADR-0002).
- The injector gets the kind from a callback at the moment the keys go out. The callback reads the offered mime types with `St.Clipboard.get_mimetypes()`. This call is synchronous, so the keys of a shortcut still go out in its key press handler (ADR-0014).
- The content is an image only when the clipboard watcher reads an image (`chooseRead`, the rule of ADR-0008). A spreadsheet cell offers its text and a picture of that text as `image/png`, and its paste stays a text paste.
- One mechanism covers the two paths. Super+V pastes the content that is on the clipboard now, also an image that another application copied. The popup puts the chosen entry on the clipboard before its delayed keys go out, so the callback sees that entry.

## Consequences

- Many terminal programs have their own action for Ctrl+V. An image paste into a terminal starts that action:
  - Bash and Zsh start a quoted insert: the next key goes into the command line as it is. For example, Enter then adds a `^M` character and does not run the command.
  - Vim starts a visual block in Normal mode. In Insert mode, it inserts the next key as it is.
  - Nano, Emacs and less move one page down.
- Leike cannot see which program runs in the terminal, so it cannot send Ctrl+V only to a program that accepts images.
- The callback also reads the mime types for copy and cut. `keysFor` does not use the kind for these actions.

## Considered Options

- A setting that turns the Ctrl+V of an image paste on and off: the side effects in Consequences are known and accepted, and a setting is one more thing that the user must know.
- Ctrl+V for each paste into a terminal: a text paste then also starts a quoted insert in the shell.
- An image when the mime types contain `image/png`: the paste of a spreadsheet cell then also sends Ctrl+V, but that paste is text.
- The entry type from the popup: Super+V does not choose an entry, so it must look at the clipboard. Two paths then have two rules.
