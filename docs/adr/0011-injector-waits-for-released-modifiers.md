# The injector waits for released modifiers

Status: superseded by ADR-0014. It superseded the Super release in the Consequences of ADR-0004.

ADR-0004 said that the injector sends a virtual Super release before Ctrl+C. Mutter ignores a release of a key that the virtual device did not press, and the application gets Ctrl+C with Super still down. Thus the injector polls the seat modifier state (`global.get_pointer()`) every 5 ms. When Shift, Ctrl, Alt, Super, AltGr, Hyper and Meta are all up, it sends Ctrl+C, Ctrl+V or Ctrl+X, or Ctrl+Shift with the letter to a terminal. It reads the WM_CLASS when it sends the keys, not when the shortcut fires. After 2 s it stops and writes a log line. A new shortcut cancels a wait.

## Consequences

- The keys go out when the user releases Super, about 100 to 400 ms after the press. Activities does not open.
- Release the letter before Super. When Super goes up first, the letter key is still down, and Mutter drops the injected press of the same key. Nothing is copied. Mutter has no API that tells if a letter key is down, so the injector cannot wait for it.
- Super held with repeated C copies one time, when Super goes up.
- Paste from the popup with Shift+Enter waits until Shift is up, then sends Ctrl+V.

## Considered Options

- Ctrl+Insert, Shift+Insert and Shift+Delete: they work when Super goes up first, because Insert is not held. But Shift+Insert pastes PRIMARY in a VTE terminal, and Firefox and VS Code are not tested with them yet. Decide again after the test with the physical keyboard.
- A virtual Super release, as in ADR-0004: Mutter ignores it.
