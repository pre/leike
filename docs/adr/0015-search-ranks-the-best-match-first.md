# Search ranks the best match first

Status: accepted.

The search finds a text that contains the query, and also a text that has the query characters in the same order with gaps, such as `claw` in `claude --allow`. With a query, the list has the best match first, not the newest entry first. The core does the match and the order in `filterEntries`, with its own small scorer and no npm dependency.

The order has three tiers. A higher tier always comes first:

1. The text contains the query.
2. The application name contains the query.
3. The text has the query characters with gaps.

The first two tiers find the same entries as the substring search that Leike had before, so a match with gaps never goes above an entry that the old search found. In a tier, the score gives the order. A match at the start of the text or at the start of a word gets a bonus. In tier 3, each character of a run of consecutive characters gets the bonus of the run start, as in fzf, a gap costs 3 points and 1 point for each character in it, and the match loses 1 point for each 8 characters before it. The list row shows only the start of a text, so a match far into the text is less useful. Of two equal matches, the newer entry comes first, because the sort is stable and the history is newest first.

A match with gaps must have all its characters in a part of the text that is at most 6 times as long as the query, and in the first 4096 characters of the text. Without this limit, almost any short query is in each long text, with its characters far apart. With the limit, `claw` matches 21 of the 122 paragraphs of the GPL-3 text, and 76 with no limit. A limit of 4 or 5 times the query length does not find `kgp` in `kubectl get pods` or `dcu` in `docker compose up`.

## Consequences

- With a query, the list has one header, "Best matches", and no day headers, because the rows are not in the order of time.
- A pinned entry has no special place in the results.
- The substring tiers look at all of the text with a case-insensitive regular expression. The search does not make a lowercase copy of each text on each key press. A history of 500 texts of 1 MiB each takes up to about 120 ms for one key press in GNOME Shell, and the substring search before this change took up to about 235 ms in gjs.
- The application name matches only as a substring. A match with gaps in a short name such as "Terminal" would match most queries for each entry of that application.
