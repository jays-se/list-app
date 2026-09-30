const KEY = "list.nav.expanded"

/** Whether the left nav shows labels. A per-browser UI preference. */
export function loadNavExpanded(): boolean {
  try {
    return localStorage.getItem(KEY) === "1"
  } catch {
    return false
  }
}

export function saveNavExpanded(expanded: boolean): void {
  try {
    localStorage.setItem(KEY, expanded ? "1" : "0")
  } catch {
    // Storage can be blocked; the nav still works for this visit.
  }
}
