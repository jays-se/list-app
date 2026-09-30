package app_test

import (
	"strconv"
	"strings"
	"testing"
)

type person struct{ ID, Name string }

type taskBody struct {
	Task struct {
		ID, Title, Status, Priority string
		StartDate, EndDate          string
		DueDate                     *string
		Description                 *string
		Version                     int
		Assignees, Owners           []person
		Labels                      []struct{ ID, Name, Color string }
		Viewer                      struct{ CanManage, CanManageOwners, IsAssignee bool }
	}
}

type taskList struct {
	Tasks []struct {
		ID, Title, Status string
		Assignees         []person
	}
}

// setupWorkspace: Alice owns "Acme", Bob joins it, Carol has her own workspace.
func setupWorkspace(t *testing.T) (alice, bob, carol *client, aliceID, bobID string) {
	return setupWorkspaceOn(t, newServer(t))
}

func setupWorkspaceOn(t *testing.T, base string) (alice, bob, carol *client, aliceID, bobID string) {
	alice, bob, carol = newClient(t, base), newClient(t, base), newClient(t, base)
	alice.signIn("Alice", "alice@example.com", "/")
	bob.signIn("Bob", "bob@example.com", "/")
	carol.signIn("Carol", "carol@example.com", "/")
	alice.do("POST", "/api/v1/workspaces", map[string]string{"name": "Acme"}, true)
	carol.do("POST", "/api/v1/workspaces", map[string]string{"name": "Carol Co"}, true)
	_, body := alice.do("GET", "/api/v1/workspaces", nil, false)
	code := decodeInto[workspaceList](t, body).Active.InviteCode
	bob.do("POST", "/api/v1/workspaces/join", map[string]string{"inviteCode": code}, true)
	_, body = alice.do("GET", "/api/v1/auth/me", nil, false)
	aliceID = decodeInto[struct{ User person }](t, body).User.ID
	_, body = bob.do("GET", "/api/v1/auth/me", nil, false)
	bobID = decodeInto[struct{ User person }](t, body).User.ID
	return
}

func fieldNames(t *testing.T, body []byte) string {
	t.Helper()
	var names []string
	for _, e := range decodeInto[problem](t, body).Errors {
		names = append(names, e.Field+":"+e.Message)
	}
	return strings.Join(names, ",")
}

func TestLabels(t *testing.T) {
	alice, bob, _, _, _ := setupWorkspace(t)

	res, body := bob.do("POST", "/api/v1/labels", map[string]string{"name": " Bug ", "color": "red"}, true)
	expect(t, res, body, 201)
	res, body = alice.do("POST", "/api/v1/labels", map[string]string{"name": "bug", "color": "blue"}, true)
	expect(t, res, body, 409)
	res, body = alice.do("POST", "/api/v1/labels", map[string]string{"name": "", "color": "neon"}, true)
	expect(t, res, body, 422)
	if got := fieldNames(t, body); got != "name:Label name is required,color:Pick a label color" {
		t.Fatalf("label validation = %s", got)
	}

	res, body = alice.do("GET", "/api/v1/labels", nil, false)
	labels := decodeInto[struct {
		Labels []struct{ ID, Name, Color string }
	}](t, body).Labels
	if len(labels) != 1 || labels[0].Name != "Bug" || labels[0].Color != "red" {
		t.Fatalf("labels = %s", body)
	}

	res, body = bob.do("DELETE", "/api/v1/labels/"+labels[0].ID, nil, true)
	expect(t, res, body, 403)
	res, body = alice.do("DELETE", "/api/v1/labels/"+labels[0].ID, nil, true)
	expect(t, res, body, 204)
	res, body = alice.do("DELETE", "/api/v1/labels/"+labels[0].ID, nil, true)
	expect(t, res, body, 404)
}

func TestTaskLifecycleAndPermissions(t *testing.T) {
	alice, bob, carol, aliceID, bobID := setupWorkspace(t)
	_, body := alice.do("POST", "/api/v1/labels", map[string]string{"name": "Bug", "color": "red"}, true)
	labelID := decodeInto[struct{ Label struct{ ID string } }](t, body).Label.ID
	_, body = carol.do("GET", "/api/v1/auth/me", nil, false)
	carolID := decodeInto[struct{ User person }](t, body).User.ID

	// Validation mirrors the reference messages.
	res, body := alice.do("POST", "/api/v1/tasks", map[string]any{"title": " "}, true)
	expect(t, res, body, 422)
	if got := fieldNames(t, body); got != "title:Title is required,startDate:Start and end date are required,endDate:Start and end date are required" {
		t.Fatalf("create validation = %s", got)
	}
	res, body = alice.do("POST", "/api/v1/tasks", map[string]any{"title": "x", "startDate": "2026-10-05", "endDate": "2026-10-01"}, true)
	if got := fieldNames(t, body); got != "endDate:End date must be on or after start date" {
		t.Fatalf("date order = %s", got)
	}
	res, body = alice.do("POST", "/api/v1/tasks", map[string]any{
		"title": "x", "startDate": "2026-10-01", "endDate": "2026-10-02", "assigneeIds": []string{carolID},
	}, true)
	expect(t, res, body, 422)

	// Create with an assignee and a label.
	res, body = alice.do("POST", "/api/v1/tasks", map[string]any{
		"title": "  Ship v1  ", "description": "  ", "priority": "HIGH",
		"startDate": "2026-10-01", "endDate": "2026-10-10", "dueDate": "2026-10-09",
		"assigneeIds": []string{bobID, bobID}, "labelIds": []string{labelID},
	}, true)
	expect(t, res, body, 201)
	if res.Header.Get("ETag") != `"1"` {
		t.Fatalf("ETag = %q", res.Header.Get("ETag"))
	}
	created := decodeInto[taskBody](t, body).Task
	if created.Title != "Ship v1" || created.Status != "TODO" || created.Description != nil ||
		len(created.Assignees) != 1 || len(created.Labels) != 1 || !created.Viewer.CanManage || !created.Viewer.CanManageOwners {
		t.Fatalf("created = %s", body)
	}
	path := "/api/v1/tasks/" + created.ID
	alice.do("POST", "/api/v1/tasks", map[string]any{"title": "Backlog item", "status": "BACKLOG", "startDate": "2026-10-01", "endDate": "2026-10-01"}, true)

	// Filters.
	for query, want := range map[string]int{"": 2, "?status=BACKLOG": 1, "?mine=true": 0, "?assigneeId=" + bobID: 1, "?labelId=" + labelID: 1, "?labelId=nope": 0} {
		_, body = alice.do("GET", "/api/v1/tasks"+query, nil, false)
		if n := len(decodeInto[taskList](t, body).Tasks); n != want {
			t.Fatalf("GET /tasks%s = %d tasks, want %d", query, n, want)
		}
	}
	_, body = bob.do("GET", "/api/v1/tasks?mine=true", nil, false)
	if n := len(decodeInto[taskList](t, body).Tasks); n != 1 {
		t.Fatalf("bob mine = %d", n)
	}
	res, body = alice.do("GET", "/api/v1/tasks?status=WHATEVER", nil, false)
	expect(t, res, body, 422)

	// Bob (assignee) can view, not change.
	res, body = bob.do("GET", path, nil, false)
	expect(t, res, body, 200)
	if v := decodeInto[taskBody](t, body).Task.Viewer; v.CanManage || !v.IsAssignee {
		t.Fatalf("bob viewer = %+v", v)
	}
	res, body = bob.doWith("PATCH", path, map[string]any{"title": "Mine now"}, true, map[string]string{"If-Match": `"1"`})
	expect(t, res, body, 403)
	res, body = bob.do("PUT", path+"/assignees", map[string]any{"userIds": []string{}}, true)
	expect(t, res, body, 403)

	// Optimistic concurrency.
	res, body = alice.do("PATCH", path, map[string]any{"title": "New"}, true)
	expect(t, res, body, 428)
	res, body = alice.doWith("PATCH", path, map[string]any{"title": "New"}, true, map[string]string{"If-Match": `"0"`})
	expect(t, res, body, 409)
	res, body = alice.doWith("PATCH", path, map[string]any{"title": "Ship v1.0", "dueDate": nil, "status": "IN_PROGRESS"}, true, map[string]string{"If-Match": `"1"`})
	expect(t, res, body, 200)
	updated := decodeInto[taskBody](t, body).Task
	if updated.Title != "Ship v1.0" || updated.DueDate != nil || updated.Status != "IN_PROGRESS" || updated.Priority != "HIGH" || updated.Version != 2 {
		t.Fatalf("partial update = %s", body)
	}
	res, body = alice.doWith("PATCH", path, map[string]any{"endDate": "2026-09-01"}, true, map[string]string{"If-Match": `"2"`})
	expect(t, res, body, 422)

	// Owners: creator only; the creator is never listed.
	res, body = alice.do("PUT", path+"/owners", map[string]any{"userIds": []string{aliceID, bobID}}, true)
	expect(t, res, body, 200)
	if o := decodeInto[taskBody](t, body).Task.Owners; len(o) != 1 || o[0].ID != bobID {
		t.Fatalf("owners = %+v", o)
	}
	res, body = bob.do("GET", path, nil, false)
	bobView := decodeInto[taskBody](t, body).Task
	if !bobView.Viewer.CanManage || bobView.Viewer.CanManageOwners {
		t.Fatalf("bob as owner = %+v", bobView.Viewer)
	}
	res, body = bob.do("PUT", path+"/owners", map[string]any{"userIds": []string{}}, true)
	expect(t, res, body, 403)
	res, body = bob.doWith("PATCH", path, map[string]any{"priority": "URGENT"}, true, map[string]string{"If-Match": `"` + strconv.Itoa(bobView.Version) + `"`})
	expect(t, res, body, 200)

	// Labels on the task; deleting the label removes it from the task.
	res, body = bob.do("PUT", path+"/labels", map[string]any{"labelIds": []string{}}, true)
	expect(t, res, body, 200)
	if l := decodeInto[taskBody](t, body).Task.Labels; len(l) != 0 {
		t.Fatalf("labels after clear = %+v", l)
	}

	// Tenant isolation: Carol can't see Acme's task.
	res, body = carol.do("GET", path, nil, false)
	expect(t, res, body, 404)
	res, body = carol.do("GET", "/api/v1/tasks/not-a-uuid", nil, false)
	expect(t, res, body, 404)

	// Delete.
	res, body = bob.do("DELETE", path, nil, true)
	expect(t, res, body, 204)
	res, body = alice.do("GET", path, nil, false)
	expect(t, res, body, 404)
	if p := decodeInto[problem](t, body); p.Detail != "This task no longer exists." {
		t.Fatalf("404 detail = %q", p.Detail)
	}
}
