package app_test

import (
	"strings"
	"testing"
)

type bulkList struct {
	Tasks []struct {
		ID, Title string
		Source    *string
		Assignees []person
		Viewer    struct{ CanManage bool }
	}
}

func TestBulkCapture(t *testing.T) {
	alice, bob, _, aliceID, _ := setupWorkspace(t)
	body := map[string]any{"source": "PERSONAL", "startDate": "2026-10-01", "endDate": "2026-10-01", "titles": []string{"Call vendor", "Send deck"}}
	key := map[string]string{"Idempotency-Key": "batch-0001"}

	res, raw := alice.doWith("POST", "/api/v1/tasks/bulk", body, true, nil)
	expect(t, res, raw, 422) // key required
	res, raw = alice.doWith("POST", "/api/v1/tasks/bulk", body, true, key)
	expect(t, res, raw, 201)
	got := decodeInto[bulkList](t, raw)
	if len(got.Tasks) != 2 || *got.Tasks[0].Source != "PERSONAL" || got.Tasks[0].Assignees[0].ID != aliceID || !got.Tasks[0].Viewer.CanManage {
		t.Fatalf("bulk = %s", raw)
	}
	// Replay: same response, no duplicates.
	res, raw2 := alice.doWith("POST", "/api/v1/tasks/bulk", body, true, key)
	expect(t, res, raw2, 201)
	if string(raw2) != string(raw) {
		t.Fatalf("replay differs:\n%s\n%s", raw, raw2)
	}
	_, list := alice.do("GET", "/api/v1/tasks", nil, false)
	if n := len(decodeInto[taskList](t, list).Tasks); n != 2 {
		t.Fatalf("tasks after replay = %d", n)
	}
	// Same key, different body → 422. Another user may reuse the string.
	body["titles"] = []string{"Other"}
	res, raw = alice.doWith("POST", "/api/v1/tasks/bulk", body, true, key)
	expect(t, res, raw, 422)
	// Atomic: one bad title creates nothing, and names the line.
	body = map[string]any{"source": "MEETING_NOTE", "startDate": "2026-10-01", "endDate": "2026-10-01", "titles": []string{"Fine", strings.Repeat("x", 501)}}
	res, raw = bob.doWith("POST", "/api/v1/tasks/bulk", body, true, key)
	expect(t, res, raw, 422)
	if !strings.Contains(string(raw), `"titles[1]"`) || !strings.Contains(string(raw), "Line 2:") {
		t.Fatalf("bad line = %s", raw)
	}
	_, list = bob.do("GET", "/api/v1/tasks", nil, false)
	if n := len(decodeInto[taskList](t, list).Tasks); n != 2 {
		t.Fatalf("partial bulk leaked: %d", n)
	}
	for _, bad := range []map[string]any{
		{"source": "EMAIL", "startDate": "2026-10-01", "endDate": "2026-10-01", "titles": []string{"a"}},
		{"source": "PERSONAL", "startDate": "2026-10-01", "endDate": "2026-10-01", "titles": []string{}},
	} {
		res, raw = bob.doWith("POST", "/api/v1/tasks/bulk", bad, true, map[string]string{"Idempotency-Key": "batch-bad-" + bad["source"].(string)})
		expect(t, res, raw, 422)
	}
}

func TestMemberLifecycle(t *testing.T) {
	alice, bob, carol, _, bobID := setupWorkspaceOn(t, newServer(t))
	// Carol joins Alice's workspace too (she also owns "Carol Co").
	_, raw := alice.do("GET", "/api/v1/workspaces", nil, false)
	code := decodeInto[workspaceList](t, raw).Active.InviteCode
	carol.do("POST", "/api/v1/workspaces/join", map[string]string{"inviteCode": code}, true)
	_, raw = carol.do("GET", "/api/v1/auth/me", nil, false)
	carolID := decodeInto[struct{ User person }](t, raw).User.ID

	// Bob is assigned, owns a task, has a checklist item and a pending request.
	task := createTask(t, alice, map[string]any{"title": "Plan", "assigneeIds": []string{bobID}})
	id := task.Task.ID
	owned := createTask(t, alice, map[string]any{"title": "Owned"})
	res, raw := alice.do("PUT", "/api/v1/tasks/"+owned.Task.ID+"/owners", map[string]any{"userIds": []string{bobID}}, true)
	expect(t, res, raw, 200)
	res, raw = alice.do("POST", "/api/v1/tasks/"+id+"/checklist", map[string]any{"title": "Step", "assigneeId": bobID}, true)
	expect(t, res, raw, 201)
	res, raw = bob.do("POST", "/api/v1/tasks/"+id+"/requests", map[string]any{"kind": "UPDATE", "payload": map[string]any{"field": "status", "value": "DONE"}}, true)
	expect(t, res, raw, 201)

	// Members can't manage members; the only owner can't leave or be demoted.
	res, raw = bob.do("DELETE", "/api/v1/workspaces/current/members/"+carolID, nil, true)
	expect(t, res, raw, 403)
	res, raw = bob.do("PATCH", "/api/v1/workspaces/current/members/"+carolID, map[string]string{"role": "OWNER"}, true)
	expect(t, res, raw, 403)
	res, raw = alice.do("POST", "/api/v1/workspaces/current/leave", nil, true)
	expect(t, res, raw, 409)
	if !strings.Contains(string(raw), "last_owner") {
		t.Fatalf("leave = %s", raw)
	}
	_, raw = alice.do("GET", "/api/v1/auth/me", nil, false)
	aliceID := decodeInto[struct{ User person }](t, raw).User.ID
	res, raw = alice.do("PATCH", "/api/v1/workspaces/current/members/"+aliceID, map[string]string{"role": "MEMBER"}, true)
	expect(t, res, raw, 409)
	res, raw = alice.do("PATCH", "/api/v1/workspaces/current/members/"+carolID, map[string]string{"role": "ADMIN"}, true)
	expect(t, res, raw, 422)
	res, raw = alice.do("PATCH", "/api/v1/workspaces/current/members/00000000-0000-0000-0000-000000000000", map[string]string{"role": "OWNER"}, true)
	expect(t, res, raw, 404)

	// Remove Bob: cleanup + history; his next request is rejected.
	res, raw = alice.do("DELETE", "/api/v1/workspaces/current/members/"+bobID, nil, true)
	expect(t, res, raw, 204)
	_, raw = alice.do("GET", "/api/v1/tasks/"+id, nil, false)
	d := decodeInto[requestBody](t, raw)
	if len(d.Task.Assignees) != 0 || d.Task.Requests[0].Status != "CANCELED" || d.Task.Requests[0].Requester != nil {
		t.Fatalf("after removal = %s", raw)
	}
	if !strings.Contains(string(raw), `"assignee":null`) {
		t.Fatalf("checklist assignment kept: %s", raw)
	}
	_, raw = alice.do("GET", "/api/v1/tasks/"+owned.Task.ID, nil, false)
	if strings.Contains(string(raw), bobID) {
		t.Fatalf("ownership kept: %s", raw)
	}
	_, raw = alice.do("GET", "/api/v1/tasks/"+id+"/history", nil, false)
	for _, k := range []string{"ASSIGNEE_REMOVED", "CHECKLIST_UNASSIGNED", "REQUEST_CANCELED"} {
		if !strings.Contains(string(raw), k) {
			t.Fatalf("history missing %s: %s", k, raw)
		}
	}
	res, raw = bob.do("GET", "/api/v1/tasks", nil, false)
	expect(t, res, raw, 409)
	if !strings.Contains(string(raw), "no_active_workspace") {
		t.Fatalf("removed member = %s", raw)
	}
	_, raw = bob.do("GET", "/api/v1/workspaces", nil, false)
	if wl := decodeInto[workspaceList](t, raw); wl.Active != nil || len(wl.Workspaces) != 0 {
		t.Fatalf("bob workspaces = %s", raw)
	}

	// Promote Carol, then Alice may leave; Carol's session stays in her own
	// workspace, Alice's moves to none (she has no other).
	res, raw = alice.do("PATCH", "/api/v1/workspaces/current/members/"+carolID, map[string]string{"role": "OWNER"}, true)
	expect(t, res, raw, 200)
	if !strings.Contains(string(raw), `"role":"OWNER"`) {
		t.Fatalf("promote = %s", raw)
	}
	res, raw = alice.do("POST", "/api/v1/workspaces/current/leave", nil, true)
	expect(t, res, raw, 204)
	_, raw = alice.do("GET", "/api/v1/workspaces", nil, false)
	if wl := decodeInto[workspaceList](t, raw); wl.Active != nil {
		t.Fatalf("alice after leave = %s", raw)
	}
	// Carol is now Acme's only owner, so she can't leave it.
	_, raw = carol.do("GET", "/api/v1/workspaces", nil, false)
	wl := decodeInto[workspaceList](t, raw)
	var acme string
	for _, w := range wl.Workspaces {
		if w.Name == "Acme" {
			acme = w.ID
		}
	}
	res, raw = carol.do("POST", "/api/v1/workspaces/switch", map[string]string{"workspaceId": acme}, true)
	expect(t, res, raw, 200)
	res, raw = carol.do("POST", "/api/v1/workspaces/current/leave", nil, true)
	expect(t, res, raw, 409)
}
