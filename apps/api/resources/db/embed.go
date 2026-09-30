// Package dbresources embeds the SQL migrations into the binary.
package dbresources

import "embed"

// Migrations holds migrations/NNNN_name.{up,down}.sql.
//
//go:embed migrations/*.sql
var Migrations embed.FS
