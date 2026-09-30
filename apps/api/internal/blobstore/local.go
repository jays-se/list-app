package blobstore

import (
	"context"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"time"

	"github.com/intellicars/list-app/apps/api/internal/apiserver"
	"github.com/intellicars/list-app/apps/api/internal/signed"
)

// Local keeps blobs on disk and serves them at /api/v1/blobs/{token}.
type Local struct {
	dir    string
	secret []byte
	now    func() time.Time
}

const blobPath = "/api/v1/blobs/"

var safeKey = regexp.MustCompile(`^[a-zA-Z0-9_-]+(/[a-zA-Z0-9_-]+)*$`)

func NewLocal(dir string, secret []byte, now func() time.Time) (*Local, error) {
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return nil, fmt.Errorf("blobstore: create %s: %w", dir, err)
	}
	return &Local{dir: dir, secret: secret, now: now}, nil
}

type grant struct {
	Op          string `json:"op"`
	Key         string `json:"key"`
	MaxSize     int64  `json:"max,omitempty"`
	ContentType string `json:"ct,omitempty"`
	Filename    string `json:"fn,omitempty"`
}

func (l *Local) path(key string) (string, error) {
	if !safeKey.MatchString(key) || filepath.Clean(key) != key {
		return "", fmt.Errorf("blobstore: unsafe key %q", key)
	}
	return filepath.Join(l.dir, filepath.FromSlash(key)), nil
}

func (l *Local) PresignPut(_ context.Context, key, contentType string, maxSize int64, ttl time.Duration) (Target, error) {
	if _, err := l.path(key); err != nil {
		return Target{}, err
	}
	tok, err := signed.Sign(l.secret, grant{Op: "put", Key: key, MaxSize: maxSize, ContentType: contentType}, ttl, l.now())
	if err != nil {
		return Target{}, err
	}
	return Target{Method: http.MethodPut, URL: blobPath + tok, Headers: map[string]string{"Content-Type": contentType}}, nil
}

func (l *Local) PresignGet(_ context.Context, key, filename, contentType string, ttl time.Duration) (string, error) {
	tok, err := signed.Sign(l.secret, grant{Op: "get", Key: key, Filename: filename, ContentType: contentType}, ttl, l.now())
	if err != nil {
		return "", err
	}
	return blobPath + tok, nil
}

func (l *Local) Stat(_ context.Context, key string) (Object, error) {
	p, err := l.path(key)
	if err != nil {
		return Object{}, err
	}
	info, err := os.Stat(p)
	if errors.Is(err, os.ErrNotExist) {
		return Object{}, ErrNotFound
	}
	if err != nil {
		return Object{}, err
	}
	return Object{Size: info.Size()}, nil
}

func (l *Local) Delete(_ context.Context, key string) error {
	p, err := l.path(key)
	if err != nil {
		return err
	}
	if err := os.Remove(p); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}

// RegisterRoutes serves the signed URLs (only when BLOB_DRIVER=local).
func (l *Local) RegisterRoutes(r *apiserver.Router) {
	r.Handle("PUT "+blobPath+"{token}", l.put)
	r.Handle("GET "+blobPath+"{token}", l.get)
}

// IsBlobRoute exempts token-authorized uploads from the CSRF header check.
func IsBlobRoute(r *http.Request) bool {
	return len(r.URL.Path) > len(blobPath) && r.URL.Path[:len(blobPath)] == blobPath
}

func (l *Local) grantFor(r *http.Request, op string) (grant, string, bool) {
	g, err := signed.Verify[grant](l.secret, r.PathValue("token"), l.now())
	if err != nil || g.Op != op {
		return grant{}, "", false
	}
	p, err := l.path(g.Key)
	return g, p, err == nil
}

func (l *Local) put(w http.ResponseWriter, r *http.Request) {
	g, p, ok := l.grantFor(r, "put")
	if !ok {
		apiserver.RespondForbidden(w, r, "invalid_upload", "This upload link is invalid or has expired.")
		return
	}
	if r.ContentLength > g.MaxSize {
		apiserver.RespondProblem(w, r, apiserver.Problem{Type: "too_large", Status: http.StatusRequestEntityTooLarge, Detail: "The file is larger than allowed."})
		return
	}
	if err := os.MkdirAll(filepath.Dir(p), 0o750); err != nil {
		apiserver.RespondInternalError(w, r)
		return
	}
	tmp, err := os.CreateTemp(filepath.Dir(p), ".upload-*")
	if err != nil {
		apiserver.RespondInternalError(w, r)
		return
	}
	defer os.Remove(tmp.Name())
	n, err := io.Copy(tmp, http.MaxBytesReader(w, r.Body, g.MaxSize))
	if cerr := tmp.Close(); err == nil {
		err = cerr
	}
	var tooLarge *http.MaxBytesError
	if errors.As(err, &tooLarge) {
		apiserver.RespondProblem(w, r, apiserver.Problem{Type: "too_large", Status: http.StatusRequestEntityTooLarge, Detail: "The file is larger than allowed."})
		return
	}
	if err != nil || n == 0 {
		apiserver.RespondBadRequest(w, r, "invalid_upload", "The upload was empty or interrupted.")
		return
	}
	if err := os.Rename(tmp.Name(), p); err != nil {
		apiserver.RespondInternalError(w, r)
		return
	}
	apiserver.RespondNoContent(w)
}

func (l *Local) get(w http.ResponseWriter, r *http.Request) {
	g, p, ok := l.grantFor(r, "get")
	if !ok {
		apiserver.RespondForbidden(w, r, "invalid_download", "This download link is invalid or has expired.")
		return
	}
	f, err := os.Open(p)
	if err != nil {
		apiserver.RespondNotFound(w, r, "File not found.")
		return
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil {
		apiserver.RespondInternalError(w, r)
		return
	}
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": g.Filename}))
	w.Header().Set("Cache-Control", "private, no-store")
	http.ServeContent(w, r, "", info.ModTime(), f)
}
