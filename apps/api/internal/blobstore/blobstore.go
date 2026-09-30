// Package blobstore stores attachment bytes behind presigned URLs so the
// API never proxies uploads (ADR-0009, ADR-0022). Drivers: local disk, S3.
package blobstore

import (
	"context"
	"errors"
	"time"
)

// Target is where and how the client sends the bytes.
type Target struct {
	Method  string
	URL     string
	Headers map[string]string
}

// Object describes a stored blob.
type Object struct {
	Size int64
}

var ErrNotFound = errors.New("blobstore: object not found")

type Store interface {
	// PresignPut lets a client upload at most maxSize bytes to key.
	PresignPut(ctx context.Context, key, contentType string, maxSize int64, ttl time.Duration) (Target, error)
	// PresignGet returns a short-lived download URL that forces a download
	// named filename.
	PresignGet(ctx context.Context, key, filename, contentType string, ttl time.Duration) (string, error)
	// Stat returns ErrNotFound if nothing was uploaded.
	Stat(ctx context.Context, key string) (Object, error)
	Delete(ctx context.Context, key string) error
}
