package blobstore

import (
	"bytes"
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/intellicars/list-app/apps/api/internal/apiserver"
)

// AWS's published SigV4 presigned-URL example (S3 docs, "Authenticating
// Requests: Using Query Parameters").
func TestS3PresignKnownAnswer(t *testing.T) {
	endpoint, _ := url.Parse("https://s3.amazonaws.com")
	s := &S3{
		Endpoint: endpoint, Region: "us-east-1", Bucket: "examplebucket",
		AccessKey: "AKIAIOSFODNN7EXAMPLE", SecretKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
		Now: func() time.Time { return time.Date(2013, 5, 24, 0, 0, 0, 0, time.UTC) },
	}
	got := s.Presign(http.MethodGet, "test.txt", 86400*time.Second, nil)
	want := "https://examplebucket.s3.amazonaws.com/test.txt?X-Amz-Algorithm=AWS4-HMAC-SHA256" +
		"&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request" +
		"&X-Amz-Date=20130524T000000Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host" +
		"&X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404"
	if got != want {
		t.Fatalf("presigned URL mismatch\n got: %s\nwant: %s", got, want)
	}
}

func TestS3PathStyleAndEscaping(t *testing.T) {
	endpoint, _ := url.Parse("http://localhost:9000")
	s := &S3{Endpoint: endpoint, Region: "us-east-1", Bucket: "list", AccessKey: "a", SecretKey: "b", PathStyle: true, Now: time.Now}
	u := s.Presign(http.MethodPut, "ws/1/a b+c", time.Minute, nil)
	if !strings.HasPrefix(u, "http://localhost:9000/list/ws/1/a%20b%2Bc?") {
		t.Fatalf("path-style URL = %s", u)
	}
}

func newLocalServer(t *testing.T) (*Local, *httptest.Server) {
	t.Helper()
	l, err := NewLocal(t.TempDir(), []byte("0123456789abcdef0123456789abcdef"), time.Now)
	if err != nil {
		t.Fatal(err)
	}
	h, _ := apiserver.NewHandler(slog.New(slog.NewTextHandler(io.Discard, nil)), []apiserver.RouteRegistrar{l})
	srv := httptest.NewServer(h)
	t.Cleanup(srv.Close)
	return l, srv
}

func TestLocalRoundTrip(t *testing.T) {
	l, srv := newLocalServer(t)
	ctx := context.Background()
	key := "ws/w1/att/a1"
	if _, err := l.Stat(ctx, key); !errors.Is(err, ErrNotFound) {
		t.Fatalf("stat before upload: %v", err)
	}
	target, err := l.PresignPut(ctx, key, "text/plain", 10, time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	put := func(body string) int {
		req, _ := http.NewRequest(target.Method, srv.URL+target.URL, strings.NewReader(body))
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
		return res.StatusCode
	}
	if code := put("this is way too large"); code != http.StatusRequestEntityTooLarge {
		t.Fatalf("oversize upload = %d", code)
	}
	if code := put("hello"); code != http.StatusNoContent {
		t.Fatalf("upload = %d", code)
	}
	if obj, err := l.Stat(ctx, key); err != nil || obj.Size != 5 {
		t.Fatalf("stat = %+v %v", obj, err)
	}

	get, _ := l.PresignGet(ctx, key, "notes 1.txt", "text/plain", time.Minute)
	res, err := http.Get(srv.URL + get)
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(res.Body)
	res.Body.Close()
	if string(body) != "hello" || !strings.Contains(res.Header.Get("Content-Disposition"), `attachment; filename="notes 1.txt"`) {
		t.Fatalf("download = %q %v", body, res.Header)
	}

	// A get token can't be used to put, and tampering fails.
	req, _ := http.NewRequest(http.MethodPut, srv.URL+get, bytes.NewReader([]byte("x")))
	if res, _ := http.DefaultClient.Do(req); res.StatusCode != http.StatusForbidden {
		t.Fatalf("put with get token = %d", res.StatusCode)
	}
	if res, _ := http.Get(srv.URL + get + "x"); res.StatusCode != http.StatusForbidden {
		t.Fatalf("tampered token = %d", res.StatusCode)
	}

	if err := l.Delete(ctx, key); err != nil {
		t.Fatal(err)
	}
	if _, err := l.Stat(ctx, key); !errors.Is(err, ErrNotFound) {
		t.Fatalf("stat after delete: %v", err)
	}
}

func TestLocalRejectsUnsafeKeys(t *testing.T) {
	l, _ := newLocalServer(t)
	for _, key := range []string{"../etc/passwd", "a/../../b", "/abs", "a b"} {
		if _, err := l.PresignPut(context.Background(), key, "text/plain", 1, time.Minute); err == nil {
			t.Errorf("key %q accepted", key)
		}
	}
}

// Optional round trip against a real S3-compatible server, e.g.
// TEST_S3_ENDPOINT=http://127.0.0.1:9000 TEST_S3_BUCKET=list TEST_S3_ACCESS_KEY=… TEST_S3_SECRET_KEY=…
func TestS3RoundTrip(t *testing.T) {
	raw := os.Getenv("TEST_S3_ENDPOINT")
	if raw == "" {
		t.Skip("TEST_S3_ENDPOINT not set")
	}
	endpoint, _ := url.Parse(raw)
	s := &S3{Endpoint: endpoint, Region: "us-east-1", Bucket: os.Getenv("TEST_S3_BUCKET"),
		AccessKey: os.Getenv("TEST_S3_ACCESS_KEY"), SecretKey: os.Getenv("TEST_S3_SECRET_KEY"), PathStyle: true, Now: time.Now}
	ctx := context.Background()
	key := "test/" + time.Now().Format("150405.000000")
	target, _ := s.PresignPut(ctx, key, "text/plain", 100, time.Minute)
	req, _ := http.NewRequest(target.Method, target.URL, strings.NewReader("hello s3"))
	req.Header.Set("Content-Type", "text/plain")
	res, err := http.DefaultClient.Do(req)
	if err != nil || res.StatusCode != 200 {
		t.Fatalf("put: %v %v", res, err)
	}
	if obj, err := s.Stat(ctx, key); err != nil || obj.Size != 8 {
		t.Fatalf("stat = %+v %v", obj, err)
	}
	get, _ := s.PresignGet(ctx, key, "x.txt", "text/plain", time.Minute)
	res, err = http.Get(get)
	if err != nil || res.StatusCode != 200 {
		t.Fatalf("get: %v %v", res, err)
	}
	res.Body.Close()
	if err := s.Delete(ctx, key); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Stat(ctx, key); !errors.Is(err, ErrNotFound) {
		t.Fatalf("stat after delete: %v", err)
	}
}
