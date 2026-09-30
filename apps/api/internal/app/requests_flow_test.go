package app_test

import (
	"context"
	"strconv"
	"strings"
	"testing"
	"time"
)

type requestBody struct {
	Task struct {
		ID, Status string
		DueDate    *string
		Version    int
		Assignees  []person
		Subtasks   []struct{ ID, Title string }
		Checklist  []struct {
			ID, Title string
			Done      bool
		}
		Viewer   struct{ CanManage, CanRequest bool }
		Requests []struct {
			ID, Kind, Status, Summary string
			Note, ReviewNote          *string
			Requester, Reviewer       *person
			Payload                   map[string]any
		}
	}
}

type inbox struct {
	Notifications []struct {
		ID, Kind, Detail string
		Task             *struct{ ID, Title string }
		TaskTitle        *string
		Actor            *person
		CommentBody      *string
		ReadAt           *string
	}
	Unread int
}

func TestChangeRequestsAndNotifications(t *testing.T) {
	base, a := newServerApp(t)
	alice, bob, carol, _, bobID := setupWorkspaceOn(t, base)
	ctx := context.Background()
	dispatch := func() {
		t.Helper()
		if _, err := a.Outbox.RunOnce(ctx, 100); err != nil {
			t.Fatal(err)
		}
	}
	inboxOf := func(c *client, q string) inbox {
		t.Helper()
		res, body := c.do("GET", "/api/v1/notifications"+q, nil, false)
		expect(t, res, body, 200)
		return decodeInto[inbox](t, body)
	}

	// Alice assigns Bob → ASSIGNED for Bob (never for Alice herself).
	task := createTask(t, alice, map[string]any{"title": "Ship v1", "assigneeIds": []string{bobID}})
	id := task.Task.ID
	dispatch()
	if in := inboxOf(bob, ""); in.Unread != 1 || in.Notifications[0].Kind != "ASSIGNED" || in.Notifications[0].Actor.Name != "Alice" {
		t.Fatalf("bob inbox = %+v", in)
	}
	if in := inboxOf(alice, ""); in.Unread != 0 {
		t.Fatalf("no self-notifications: %+v", in)
	}

	// Bob is an assignee who can't manage → requests.
	res, body := bob.do("GET", "/api/v1/tasks/"+id, nil, false)
	if d := decodeInto[requestBody](t, body); d.Task.Viewer.CanManage || !d.Task.Viewer.CanRequest {
		t.Fatalf("bob viewer = %+v", d.Task.Viewer)
	}
	post := func(c *client, path string, payload map[string]any) (int, requestBody, []byte) {
		t.Helper()
		res, body := c.do("POST", path, payload, true)
		if res.StatusCode >= 300 {
			return res.StatusCode, requestBody{}, body
		}
		return res.StatusCode, decodeInto[requestBody](t, body), body
	}
	status, d, raw := post(bob, "/api/v1/tasks/"+id+"/requests", map[string]any{
		"kind": "UPDATE", "payload": map[string]any{"field": "status", "value": "IN_PROGRESS"}, "note": " Started today ",
	})
	if status != 201 || len(d.Task.Requests) != 1 || d.Task.Requests[0].Summary != "Change status to In progress" ||
		*d.Task.Requests[0].Note != "Started today" || d.Task.Requests[0].Payload["from"] != "TODO" {
		t.Fatalf("create request = %d %s", status, raw)
	}
	statusReq := d.Task.Requests[0].ID

	// Validation, duplicates and permissions.
	for _, c := range []struct {
		who    *client
		body   map[string]any
		status int
		want   string
	}{
		{bob, map[string]any{"kind": "UPDATE", "payload": map[string]any{"field": "status", "value": "IN_PROGRESS"}}, 409, "request_duplicate"},
		{bob, map[string]any{"kind": "UPDATE", "payload": map[string]any{"field": "status", "value": "TODO"}}, 422, "already the current value"},
		{bob, map[string]any{"kind": "UPDATE", "payload": map[string]any{"field": "title", "value": "x"}}, 422, "Choose status"},
		{bob, map[string]any{"kind": "UPDATE", "payload": map[string]any{"field": "endDate", "value": "2026-09-01"}}, 422, "End date must be on or after start date"},
		{bob, map[string]any{"kind": "NOPE", "payload": map[string]any{}}, 422, "valid request type"},
		{bob, map[string]any{"kind": "SUBTASK_ADD", "payload": map[string]any{"title": "x"}, "note": strings.Repeat("n", 1001)}, 422, "1,000 characters"},
		{alice, map[string]any{"kind": "SUBTASK_ADD", "payload": map[string]any{"title": "x"}}, 403, "directly"},
		{carol, map[string]any{"kind": "SUBTASK_ADD", "payload": map[string]any{"title": "x"}}, 404, ""},
	} {
		status, _, raw := post(c.who, "/api/v1/tasks/"+id+"/requests", c.body)
		if status != c.status || !strings.Contains(string(raw), c.want) {
			t.Fatalf("%v → %d %s, want %d %q", c.body, status, raw, c.status, c.want)
		}
	}

	// More kinds: due date, subtask, checklist.
	for _, body := range []map[string]any{
		{"kind": "UPDATE", "payload": map[string]any{"field": "dueDate", "value": "2026-10-03"}},
		{"kind": "SUBTASK_ADD", "payload": map[string]any{"title": "Write docs"}},
		{"kind": "CHECKLIST_ADD", "payload": map[string]any{"title": "QA pass"}},
		{"kind": "ASSIGNEE_REMOVE", "payload": map[string]any{"userId": bobID}},
	} {
		if status, _, raw := post(bob, "/api/v1/tasks/"+id+"/requests", body); status != 201 {
			t.Fatalf("%v → %d %s", body, status, raw)
		}
	}
	dispatch()
	in := inboxOf(alice, "?unread=true")
	if in.Unread != 5 || in.Notifications[0].Kind != "REQUEST" || in.Notifications[0].Detail != "requested: Remove assignee Bob" {
		t.Fatalf("alice inbox = %+v", in)
	}

	// Only managers review; only the requester withdraws.
	if status, _, _ := post(bob, "/api/v1/requests/"+statusReq+"/approve", nil); status != 403 {
		t.Fatalf("bob approve = %d", status)
	}
	if status, _, _ := post(alice, "/api/v1/requests/"+statusReq+"/cancel", nil); status != 403 {
		t.Fatalf("alice cancel = %d", status)
	}

	// Approve status → applied, history, REVIEWED + STATUS for Bob.
	status, d, raw = post(alice, "/api/v1/requests/"+statusReq+"/approve", nil)
	if status != 200 || d.Task.Status != "IN_PROGRESS" || d.Task.Requests[4].Status != "APPROVED" || d.Task.Requests[4].Reviewer.Name != "Alice" {
		t.Fatalf("approve = %d %s", status, raw)
	}
	if status, _, raw := post(alice, "/api/v1/requests/"+statusReq+"/approve", nil); status != 409 || !strings.Contains(string(raw), "already approved") {
		t.Fatalf("second approve = %d %s", status, raw)
	}
	reqByKind := map[string]string{}
	for _, r := range d.Task.Requests {
		reqByKind[r.Kind] = r.ID
	}
	var dueReq string
	for _, r := range d.Task.Requests {
		if r.Kind == "UPDATE" && r.Status == "PENDING" {
			dueReq = r.ID
		}
	}
	// A manager edit makes the due-date request stale → 409.
	res, body = alice.doWith("PATCH", "/api/v1/tasks/"+id, map[string]any{"dueDate": "2026-10-04"}, true, map[string]string{"If-Match": `"` + strconv.Itoa(d.Task.Version) + `"`})
	expect(t, res, body, 200)
	if status, _, raw := post(alice, "/api/v1/requests/"+dueReq+"/approve", nil); status != 409 || !strings.Contains(string(raw), "request_stale") {
		t.Fatalf("stale approve = %d %s", status, raw)
	}
	status, d, raw = post(alice, "/api/v1/requests/"+dueReq+"/reject", map[string]any{"note": "Keeping the 4th"})
	if status != 200 {
		t.Fatalf("reject = %d %s", status, raw)
	}
	// Subtask (assigned to the requester) and checklist item.
	if status, d, raw = post(alice, "/api/v1/requests/"+reqByKind["SUBTASK_ADD"]+"/approve", nil); status != 200 || len(d.Task.Subtasks) != 1 {
		t.Fatalf("approve subtask = %d %s", status, raw)
	}
	if status, d, raw = post(alice, "/api/v1/requests/"+reqByKind["CHECKLIST_ADD"]+"/approve", nil); status != 200 || len(d.Task.Checklist) != 1 {
		t.Fatalf("approve checklist = %d %s", status, raw)
	}
	// Bob withdraws his own removal request.
	if status, d, raw = post(bob, "/api/v1/requests/"+reqByKind["ASSIGNEE_REMOVE"]+"/cancel", nil); status != 200 {
		t.Fatalf("cancel = %d %s", status, raw)
	}
	for _, r := range d.Task.Requests {
		if r.Status == "PENDING" {
			t.Fatalf("still pending: %+v", r)
		}
	}
	// Checklist update request against the approved item.
	item := d.Task.Checklist[0]
	status, d, raw = post(bob, "/api/v1/tasks/"+id+"/requests", map[string]any{"kind": "CHECKLIST_UPDATE", "payload": map[string]any{"itemId": item.ID, "done": true}})
	if status != 201 || d.Task.Requests[0].Summary != "Mark “QA pass” done" {
		t.Fatalf("checklist update request = %d %s", status, raw)
	}
	if status, d, raw = post(alice, "/api/v1/requests/"+d.Task.Requests[0].ID+"/approve", nil); status != 200 || !d.Task.Checklist[0].Done {
		t.Fatalf("approve checklist update = %d %s", status, raw)
	}

	dispatch()
	in = inboxOf(bob, "")
	kinds := map[string]int{}
	for _, n := range in.Notifications {
		kinds[n.Kind]++
	}
	// ASSIGNED (task) + ASSIGNED (subtask) · REVIEWED ×5 (4 approved, 1 rejected) · STATUS (approved by Alice).
	if kinds["ASSIGNED"] != 2 || kinds["REVIEWED"] != 5 || kinds["STATUS"] != 1 {
		t.Fatalf("bob kinds = %v", kinds)
	}

	// History records the request lifecycle.
	_, body = alice.do("GET", "/api/v1/tasks/"+id+"/history", nil, false)
	hist := string(body)
	for _, k := range []string{"REQUEST_CREATED", "REQUEST_APPROVED", "REQUEST_REJECTED", "REQUEST_CANCELED"} {
		if !strings.Contains(hist, k) {
			t.Fatalf("history missing %s", k)
		}
	}

	// Mentions, settings, read state.
	res, body = bob.do("PUT", "/api/v1/notifications/settings", map[string]any{"settings": []map[string]any{{"kind": "MENTION", "enabled": false}}}, true)
	expect(t, res, body, 200)
	if !strings.Contains(string(body), `{"kind":"MENTION","enabled":false}`) || !strings.Contains(string(body), `{"kind":"DUE","enabled":true}`) {
		t.Fatalf("settings = %s", body)
	}
	res, body = bob.do("PUT", "/api/v1/notifications/settings", map[string]any{"settings": []map[string]any{{"kind": "SPAM", "enabled": false}}}, true)
	expect(t, res, body, 422)
	before := inboxOf(bob, "").Unread
	res, body = alice.do("POST", "/api/v1/tasks/"+id+"/comments", map[string]any{"body": "@Bob please check", "mentionedUserIds": []string{bobID}}, true)
	expect(t, res, body, 201)
	dispatch()
	if n := inboxOf(bob, "").Unread; n != before {
		t.Fatalf("disabled MENTION still delivered: %d → %d", before, n)
	}
	bob.do("PUT", "/api/v1/notifications/settings", map[string]any{"settings": []map[string]any{{"kind": "MENTION", "enabled": true}}}, true)
	alice.do("POST", "/api/v1/tasks/"+id+"/comments", map[string]any{"body": "@Bob again", "mentionedUserIds": []string{bobID}}, true)
	dispatch()
	in = inboxOf(bob, "")
	if in.Notifications[0].Kind != "MENTION" || *in.Notifications[0].CommentBody != "@Bob again" {
		t.Fatalf("mention = %+v", in.Notifications[0])
	}
	res, body = bob.do("POST", "/api/v1/notifications/"+in.Notifications[0].ID+"/read", nil, true)
	expect(t, res, body, 204)
	if got := inboxOf(bob, "").Unread; got != in.Unread-1 {
		t.Fatalf("unread after read = %d", got)
	}
	res, body = bob.do("POST", "/api/v1/notifications/00000000-0000-0000-0000-000000000000/read", nil, true)
	expect(t, res, body, 404)
	res, body = bob.do("POST", "/api/v1/notifications/read-all", nil, true)
	expect(t, res, body, 204)
	if got := inboxOf(bob, "?unread=true"); got.Unread != 0 || len(got.Notifications) != 0 {
		t.Fatalf("after read-all = %+v", got)
	}

	// DUE: tomorrow's open tasks, once per day, even when run twice.
	due := createTask(t, alice, map[string]any{"title": "Renew domain", "dueDate": "2026-10-02", "assigneeIds": []string{bobID}})
	createTask(t, alice, map[string]any{"title": "Unassigned due", "dueDate": "2026-10-02"})
	now := time.Date(2026, 10, 1, 9, 0, 0, 0, time.UTC)
	for range 2 {
		if _, err := a.Notifications.RunDue(ctx, now); err != nil {
			t.Fatal(err)
		}
	}
	countKind := func(c *client, kind string) int {
		n := 0
		for _, x := range inboxOf(c, "").Notifications {
			if x.Kind == kind {
				n++
			}
		}
		return n
	}
	if countKind(bob, "DUE") != 1 || countKind(alice, "DUE") != 1 {
		t.Fatalf("DUE bob=%d alice=%d", countKind(bob, "DUE"), countKind(alice, "DUE"))
	}

	// Deleted task: the notification stays, task is null, title kept.
	res, body = alice.do("DELETE", "/api/v1/tasks/"+due.Task.ID, nil, true)
	expect(t, res, body, 204)
	for _, n := range inboxOf(bob, "").Notifications {
		if n.Kind == "DUE" && (n.Task != nil || *n.TaskTitle != "Renew domain") {
			t.Fatalf("deleted task notification = %+v", n)
		}
	}
}
