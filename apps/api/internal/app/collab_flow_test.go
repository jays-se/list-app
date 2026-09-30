package app_test

import (
	"io"
	"net/http"
	"strconv"
	"strings"
	"testing"
)

type detailBody struct {
	Task struct {
		ID, Title, Status string
		Version           int
		Client            *struct{ ID, Name string }
		Parent            *struct{ ID, Title string }
		Subtasks          []struct{ ID, Title, Status string }
		Checklist         []struct {
			ID, Title string
			Done      bool
			Assignee  *person
		}
		Comments []struct {
			Body     string
			Author   *person
			Mentions []person
		}
		Attachments []struct{ ID, Filename, DownloadURL string }
		Viewer      struct{ CanManage, CanManageOwners bool }
	}
}

type historyBody struct {
	Events []struct {
		Kind                  string
		Field, From, To, Subj *string
		Subject               *string
		Actor                 *person
	}
	Stages []struct {
		Status string
		LeftAt *string
	}
}

func createTask(t *testing.T, c *client, body map[string]any) detailBody {
	t.Helper()
	base := map[string]any{"startDate": "2026-10-01", "endDate": "2026-10-05"}
	for k, v := range body {
		base[k] = v
	}
	res, raw := c.do("POST", "/api/v1/tasks", base, true)
	expect(t, res, raw, 201)
	return decodeInto[detailBody](t, raw)
}

func TestClientsAndSubtasks(t *testing.T) {
	alice, bob, _, _, _ := setupWorkspace(t)

	res, body := bob.do("POST", "/api/v1/clients", map[string]any{"name": " Globex ", "color": "teal", "email": "ops@globex.test"}, true)
	expect(t, res, body, 201)
	client := decodeInto[struct{ Client struct{ ID, Name string } }](t, body).Client
	res, body = bob.do("POST", "/api/v1/clients", map[string]any{"name": "", "color": "neon", "email": "nope"}, true)
	expect(t, res, body, 422)
	if got := fieldNames(t, body); got != "name:Client name is required,email:Enter a valid email,color:Pick a color" {
		t.Fatalf("client validation = %s", got)
	}

	parent := createTask(t, alice, map[string]any{"title": "Launch", "clientId": client.ID})
	if parent.Task.Client == nil || parent.Task.Client.Name != "Globex" {
		t.Fatalf("client link = %+v", parent.Task.Client)
	}
	sub := createTask(t, alice, map[string]any{"title": "Write copy", "parentId": parent.Task.ID})
	if sub.Task.Parent == nil || sub.Task.Parent.ID != parent.Task.ID {
		t.Fatalf("parent = %+v", sub.Task.Parent)
	}
	// One level only; Bob (member) can't add subtasks to Alice's task.
	res, body = alice.do("POST", "/api/v1/tasks", map[string]any{"title": "x", "startDate": "2026-10-01", "endDate": "2026-10-01", "parentId": sub.Task.ID}, true)
	expect(t, res, body, 422)
	res, body = bob.do("POST", "/api/v1/tasks", map[string]any{"title": "x", "startDate": "2026-10-01", "endDate": "2026-10-01", "parentId": parent.Task.ID}, true)
	expect(t, res, body, 403)

	res, body = alice.do("GET", "/api/v1/tasks/"+parent.Task.ID, nil, false)
	if d := decodeInto[detailBody](t, body); len(d.Task.Subtasks) != 1 || d.Task.Subtasks[0].Title != "Write copy" {
		t.Fatalf("subtasks = %s", body)
	}
	for q, want := range map[string]int{"?clientId=" + client.ID: 1, "?parentId=" + parent.Task.ID: 1, "": 2} {
		_, body = alice.do("GET", "/api/v1/tasks"+q, nil, false)
		if n := len(decodeInto[taskList](t, body).Tasks); n != want {
			t.Fatalf("GET /tasks%s = %d, want %d", q, n, want)
		}
	}

	// Deleting the client unlinks (OWNER only); the task stays.
	res, body = bob.do("DELETE", "/api/v1/clients/"+client.ID, nil, true)
	expect(t, res, body, 403)
	res, body = alice.do("DELETE", "/api/v1/clients/"+client.ID, nil, true)
	expect(t, res, body, 204)
	res, body = alice.do("GET", "/api/v1/tasks/"+parent.Task.ID, nil, false)
	expect(t, res, body, 200)
	if d := decodeInto[detailBody](t, body); d.Task.Client != nil {
		t.Fatalf("client should be unlinked: %s", body)
	}

	// Deleting the parent deletes its subtasks.
	alice.do("DELETE", "/api/v1/tasks/"+parent.Task.ID, nil, true)
	res, body = alice.do("GET", "/api/v1/tasks/"+sub.Task.ID, nil, false)
	expect(t, res, body, 404)
}

func TestWorkspaceOwnerManagesAnyTask(t *testing.T) {
	alice, bob, _, _, bobID := setupWorkspace(t)
	task := createTask(t, bob, map[string]any{"title": "Bob's task"})
	path := "/api/v1/tasks/" + task.Task.ID
	res, body := alice.do("GET", path, nil, false)
	if v := decodeInto[detailBody](t, body).Task.Viewer; !v.CanManage || !v.CanManageOwners {
		t.Fatalf("workspace owner viewer = %+v", v)
	}
	res, body = alice.doWith("PATCH", path, map[string]any{"title": "Edited by the owner"}, true, map[string]string{"If-Match": `"1"`})
	expect(t, res, body, 200)
	res, body = alice.do("PUT", path+"/owners", map[string]any{"userIds": []string{bobID}}, true)
	expect(t, res, body, 200) // bob is the creator, so he is filtered out
}

func TestChecklistCommentsAttachmentsHistory(t *testing.T) {
	alice, bob, carol, _, bobID := setupWorkspace(t)
	task := createTask(t, alice, map[string]any{"title": "Ship"})
	path := "/api/v1/tasks/" + task.Task.ID

	// Checklist.
	res, body := alice.do("POST", path+"/checklist", map[string]any{"title": " Draft ", "assigneeId": bobID}, true)
	expect(t, res, body, 201)
	item := decodeInto[struct{ Item struct{ ID string } }](t, body).Item
	res, body = bob.do("POST", path+"/checklist", map[string]any{"title": "Nope"}, true)
	expect(t, res, body, 403)
	res, body = alice.do("POST", path+"/checklist", map[string]any{"title": " "}, true)
	expect(t, res, body, 422)
	res, body = alice.do("PATCH", "/api/v1/tasks/checklist/"+item.ID, map[string]any{"done": true, "title": "Draft v2", "assigneeId": nil}, true)
	expect(t, res, body, 200)
	if it := decodeInto[struct {
		Item struct {
			Done     bool
			Title    string
			Assignee *person
		}
	}](t, body).Item; !it.Done || it.Title != "Draft v2" || it.Assignee != nil {
		t.Fatalf("checklist update = %s", body)
	}

	// Comments: any member; mentions must be members.
	res, body = bob.do("POST", path+"/comments", map[string]any{"body": "Looks good @Alice", "mentionedUserIds": []string{}}, true)
	expect(t, res, body, 201)
	_, body = carol.do("GET", "/api/v1/auth/me", nil, false)
	carolID := decodeInto[struct{ User person }](t, body).User.ID
	res, body = bob.do("POST", path+"/comments", map[string]any{"body": "hi", "mentionedUserIds": []string{carolID}}, true)
	expect(t, res, body, 422)
	res, body = alice.do("POST", path+"/comments", map[string]any{"body": "Thanks @Bob", "mentionedUserIds": []string{bobID}}, true)
	expect(t, res, body, 201)
	if c := decodeInto[struct{ Comment struct{ Mentions []person } }](t, body).Comment; len(c.Mentions) != 1 || c.Mentions[0].ID != bobID {
		t.Fatalf("mentions = %s", body)
	}

	// Attachments: reserve → PUT bytes → complete → download → delete.
	res, body = alice.do("POST", path+"/attachments", map[string]any{"filename": "big.bin", "mimeType": "application/octet-stream", "size": 6 * 1024 * 1024}, true)
	expect(t, res, body, 422)
	if got := fieldNames(t, body); got != "size:big.bin is larger than 5MB" {
		t.Fatalf("size message = %s", got)
	}
	content := "hello attachment"
	res, body = alice.do("POST", path+"/attachments", map[string]any{"filename": "../notes.txt", "mimeType": "text/plain", "size": len(content)}, true)
	expect(t, res, body, 201)
	up := decodeInto[struct {
		Attachment struct{ ID, Filename string }
		Upload     struct {
			Method, URL string
			Headers     map[string]string
		}
	}](t, body)
	if up.Attachment.Filename != "notes.txt" || up.Upload.Method != "PUT" {
		t.Fatalf("upload slot = %s", body)
	}
	res, body = alice.do("POST", "/api/v1/attachments/"+up.Attachment.ID+"/complete", nil, true)
	expect(t, res, body, 409) // nothing uploaded yet
	req, _ := http.NewRequest("PUT", alice.base+up.Upload.URL, strings.NewReader(content))
	req.Header.Set("Content-Type", "text/plain")
	putRes, err := http.DefaultClient.Do(req) // no cookies, no CSRF header: the token authorizes
	if err != nil || putRes.StatusCode != 204 {
		t.Fatalf("blob PUT = %v %v", putRes, err)
	}
	res, body = alice.do("POST", "/api/v1/attachments/"+up.Attachment.ID+"/complete", nil, true)
	expect(t, res, body, 200)

	res, _ = bob.do("GET", "/api/v1/attachments/"+up.Attachment.ID, nil, false)
	if res.StatusCode != 302 {
		t.Fatalf("download = %d", res.StatusCode)
	}
	dl, err := http.Get(alice.base + res.Header.Get("Location"))
	if err != nil {
		t.Fatal(err)
	}
	got, _ := io.ReadAll(dl.Body)
	dl.Body.Close()
	if string(got) != content || !strings.Contains(dl.Header.Get("Content-Disposition"), "notes.txt") {
		t.Fatalf("downloaded %q %v", got, dl.Header)
	}
	res, _ = carol.do("GET", "/api/v1/attachments/"+up.Attachment.ID, nil, false)
	if res.StatusCode != 404 {
		t.Fatalf("other workspace download = %d", res.StatusCode)
	}

	// Limit: at most 5 per task (pending slots count).
	for i := range 4 {
		res, body = alice.do("POST", path+"/attachments", map[string]any{"filename": "f" + strconv.Itoa(i), "mimeType": "text/plain", "size": 1}, true)
		expect(t, res, body, 201)
	}
	res, body = alice.do("POST", path+"/attachments", map[string]any{"filename": "sixth", "mimeType": "text/plain", "size": 1}, true)
	expect(t, res, body, 422)

	res, body = alice.do("GET", path, nil, false)
	d := decodeInto[detailBody](t, body)
	if len(d.Task.Checklist) != 1 || len(d.Task.Comments) != 2 || len(d.Task.Attachments) != 1 || d.Task.Attachments[0].DownloadURL != "/api/v1/attachments/"+up.Attachment.ID {
		t.Fatalf("detail collections = %s", body)
	}

	res, body = alice.do("DELETE", "/api/v1/attachments/"+up.Attachment.ID, nil, true)
	expect(t, res, body, 204)

	// Status stages + events.
	alice.doWith("PATCH", path, map[string]any{"status": "IN_PROGRESS", "priority": "HIGH"}, true, map[string]string{"If-Match": `"1"`})
	res, body = bob.do("GET", path+"/history", nil, false)
	expect(t, res, body, 200)
	h := decodeInto[historyBody](t, body)
	var kinds []string
	for _, e := range h.Events {
		kinds = append(kinds, e.Kind)
	}
	joined := strings.Join(kinds, ",")
	for _, k := range []string{"CREATED", "CHECKLIST_ADDED", "CHECKLIST_ASSIGNED", "CHECKLIST_RENAMED", "CHECKLIST_CHECKED", "CHECKLIST_UNASSIGNED",
		"COMMENTED", "ATTACHMENT_ADDED", "ATTACHMENT_REMOVED", "STATUS", "UPDATED"} {
		if !strings.Contains(joined, k) {
			t.Fatalf("missing %s in %s", k, joined)
		}
	}
	if h.Events[0].Kind != "STATUS" && h.Events[0].Kind != "UPDATED" {
		t.Fatalf("newest first expected, got %s", joined)
	}
	if len(h.Stages) != 2 || h.Stages[0].Status != "TODO" || h.Stages[0].LeftAt == nil || h.Stages[1].Status != "IN_PROGRESS" || h.Stages[1].LeftAt != nil {
		t.Fatalf("stages = %s", body)
	}
}
