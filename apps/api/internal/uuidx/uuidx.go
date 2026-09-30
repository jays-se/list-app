// Package uuidx validates ids from URLs and bodies before they reach SQL,
// so malformed ids become 404/422 instead of a database cast error.
package uuidx

import "regexp"

var pattern = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

func Valid(s string) bool { return pattern.MatchString(s) }

// AllValid reports whether every id is a UUID.
func AllValid(ids []string) bool {
	for _, id := range ids {
		if !Valid(id) {
			return false
		}
	}
	return true
}
