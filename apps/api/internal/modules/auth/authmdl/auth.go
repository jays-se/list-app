// Package authmdl holds the auth module's models (backend-go rule §9).
package authmdl

import (
	"encoding/json"
	"time"
)

// User is the users table row.
type User struct {
	ID           string
	Email        string
	Name         string
	ImageURL     *string
	AuthProvider string
	AuthSubject  string
}

func (u User) ToJSON() ([]byte, error) { return json.Marshal(u) }

// Identity is what an identity provider asserts after sign-in.
type Identity struct {
	Provider string
	Subject  string
	Email    string
	Name     string
	Image    *string
}

func (i Identity) ToJSON() ([]byte, error) { return json.Marshal(i) }

// Session is the sessions table row (the token itself is never stored).
type Session struct {
	IDHash            []byte
	UserID            string
	ActiveWorkspaceID *string
	ExpiresAt         time.Time
}

func (s Session) ToJSON() ([]byte, error) { return json.Marshal(s) }
