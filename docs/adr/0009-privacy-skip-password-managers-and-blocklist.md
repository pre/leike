# Privacy: skip password managers and blocked applications

Status: accepted.

Leike does not keep a clipboard change that offers the mime type `x-kde-passwordManagerHint`. Password managers set this mime type when they copy a password. Leike also does not keep a change that comes from an application whose WM_CLASS is in the setting `blocklist-wm-classes`. The list is empty by default.

## Consequences

- A password manager that does not set `x-kde-passwordManagerHint` needs an entry in the blocklist.
- The history file is not encrypted.
