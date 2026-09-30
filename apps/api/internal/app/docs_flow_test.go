package app_test

import (
	"io"
	"net/http"
	"strings"
	"testing"
)

type docBody struct {
	Doc struct {
		ID, Title, Content string
		Version            int
		Client             *struct{ ID, Name string }
		CreatedBy          *person
		UpdatedBy          *person
		Files              []struct{ ID, Filename, DownloadURL string }
		Viewer             struct{ CanDelete bool }
	}
}

func TestDocs(t *testing.T) {
	alice, bob, carol, _, _ := setupWorkspace(t)

	res, raw := alice.do("POST", "/api/v1/docs", map[string]any{"title": "  "}, true)
	expect(t, res, raw, 422)
	res, raw = alice.do("POST", "/api/v1/docs", map[string]any{"title": "x", "content": strings.Repeat("a", 200_001)}, true)
	expect(t, res, raw, 422)
	res, raw = alice.do("POST", "/api/v1/docs", map[string]any{"title": "x", "clientId": "nope"}, true)
	expect(t, res, raw, 422)

	res, raw = bob.do("POST", "/api/v1/clients", map[string]any{"name": "Globex", "color": "teal"}, true)
	expect(t, res, raw, 201)
	clientID := decodeInto[struct{ Client struct{ ID string } }](t, raw).Client.ID

	res, raw = alice.do("POST", "/api/v1/docs", map[string]any{"title": " Kickoff notes ", "content": "# Agenda\n- one", "clientId": clientID}, true)
	expect(t, res, raw, 201)
	doc := decodeInto[docBody](t, raw).Doc
	if doc.Title != "Kickoff notes" || doc.Client == nil || doc.Version != 1 || !doc.Viewer.CanDelete || res.Header.Get("ETag") != `"1"` {
		t.Fatalf("created = %s", raw)
	}
	bob.do("POST", "/api/v1/docs", map[string]any{"title": "Bob's"}, true)

	_, raw = alice.do("GET", "/api/v1/docs", nil, false)
	list := decodeInto[struct {
		Docs []struct {
			ID, Title, Excerpt string
			FileCount          int
		}
	}](t, raw)
	if len(list.Docs) != 2 || list.Docs[0].Title != "Bob's" || list.Docs[1].Excerpt != "# Agenda\n- one" {
		t.Fatalf("list = %s", raw)
	}
	_, raw = alice.do("GET", "/api/v1/docs?clientId="+clientID, nil, false)
	if n := strings.Count(string(raw), `"id"`); !strings.Contains(string(raw), "Kickoff") || strings.Contains(string(raw), "Bob's") || n < 1 {
		t.Fatalf("client filter = %s", raw)
	}
	_, raw = alice.do("GET", "/api/v1/clients/"+clientID, nil, false)
	if !strings.Contains(string(raw), `"docCount":1`) {
		t.Fatalf("docCount = %s", raw)
	}

	// Any member edits (If-Match); 428 without, 409 when stale.
	path := "/api/v1/docs/" + doc.ID
	res, raw = bob.do("PATCH", path, map[string]any{"content": "x"}, true)
	expect(t, res, raw, 428)
	res, raw = bob.doWith("PATCH", path, map[string]any{"content": "# Agenda\n- one\n- two"}, true, map[string]string{"If-Match": `"1"`})
	expect(t, res, raw, 200)
	edited := decodeInto[docBody](t, raw).Doc
	if edited.Version != 2 || edited.UpdatedBy == nil || edited.UpdatedBy.Name != "Bob" || edited.Viewer.CanDelete {
		t.Fatalf("edited = %s", raw)
	}
	res, raw = alice.doWith("PATCH", path, map[string]any{"title": "Mine"}, true, map[string]string{"If-Match": `"1"`})
	expect(t, res, raw, 409)
	res, raw = alice.doWith("PATCH", path, map[string]any{"clientId": nil, "title": "Kickoff"}, true, map[string]string{"If-Match": `"2"`})
	expect(t, res, raw, 200)
	if d := decodeInto[docBody](t, raw).Doc; d.Client != nil || d.Title != "Kickoff" || d.Content != "# Agenda\n- one\n- two" {
		t.Fatalf("patch = %s", raw)
	}
	res, _ = carol.do("GET", path, nil, false)
	if res.StatusCode != 404 {
		t.Fatalf("other workspace = %d", res.StatusCode)
	}

	// Files: 20 MB limit, reserve → PUT → complete → download → delete.
	res, raw = bob.do("POST", path+"/files", map[string]any{"filename": "huge.pdf", "mimeType": "application/pdf", "size": 21 * 1024 * 1024}, true)
	expect(t, res, raw, 422)
	content := "%PDF-fake"
	res, raw = bob.do("POST", path+"/files", map[string]any{"filename": "brief.pdf", "mimeType": "application/pdf", "size": len(content)}, true)
	expect(t, res, raw, 201)
	up := decodeInto[struct {
		Attachment struct{ ID string }
		Upload     struct{ URL string }
	}](t, raw)
	res, raw = bob.do("POST", "/api/v1/doc-files/"+up.Attachment.ID+"/complete", nil, true)
	expect(t, res, raw, 409)
	req, _ := http.NewRequest("PUT", bob.base+up.Upload.URL, strings.NewReader(content))
	req.Header.Set("Content-Type", "application/pdf")
	if put, err := http.DefaultClient.Do(req); err != nil || put.StatusCode != 204 {
		t.Fatalf("PUT = %v %v", put, err)
	}
	res, raw = bob.do("POST", "/api/v1/doc-files/"+up.Attachment.ID+"/complete", nil, true)
	expect(t, res, raw, 200)
	_, raw = alice.do("GET", path, nil, false)
	if d := decodeInto[docBody](t, raw).Doc; len(d.Files) != 1 || d.Files[0].DownloadURL != "/api/v1/doc-files/"+up.Attachment.ID {
		t.Fatalf("files = %s", raw)
	}
	res, _ = alice.do("GET", "/api/v1/doc-files/"+up.Attachment.ID, nil, false)
	if res.StatusCode != 302 {
		t.Fatalf("download = %d", res.StatusCode)
	}
	dl, err := http.Get(alice.base + res.Header.Get("Location"))
	if err != nil {
		t.Fatal(err)
	}
	got, _ := io.ReadAll(dl.Body)
	dl.Body.Close()
	if string(got) != content {
		t.Fatalf("downloaded %q", got)
	}
	res, raw = alice.do("DELETE", "/api/v1/doc-files/"+up.Attachment.ID, nil, true)
	expect(t, res, raw, 204)
	res, raw = alice.do("DELETE", "/api/v1/doc-files/"+up.Attachment.ID, nil, true)
	expect(t, res, raw, 404)

	// Delete: not by another member; by the creator.
	res, raw = bob.do("DELETE", path, nil, true)
	expect(t, res, raw, 403)
	res, raw = alice.do("DELETE", path, nil, true)
	expect(t, res, raw, 204)
	res, raw = alice.do("GET", path, nil, false)
	expect(t, res, raw, 404)
}
