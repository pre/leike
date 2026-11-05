# History limits and dedupe

Status: accepted.

The history keeps 500 entries by default (setting `max-entries`). When the history has more, the core removes the oldest entry that is not pinned. Leike does not keep an image that is larger than 10 MiB (setting `max-image-bytes`). When the user copies content that is already in the history, the core moves that entry to the top and sets its time to now. It does not add a second entry. The hash of the content identifies equal content.

## Consequences

- Pinned entries stay, also when the history is full.
- The core gives the ids of the removed image entries to the platform, and the platform deletes the PNG files.
