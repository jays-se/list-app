package tasksvc

import (
	"errors"
	"testing"
)

// Table-driven policy check: every role × every mutation (E5-S1 AC).
func TestPolicy(t *testing.T) {
	a := Access{CreatedBy: "creator", OwnerIDs: []string{"owner"}, AssigneeIDs: []string{"assignee", "owner"}}
	actions := []struct {
		name   string
		action Action
	}{
		{"view", ActionView}, {"update", ActionUpdate}, {"assignees", ActionSetAssignees},
		{"labels", ActionSetLabels}, {"owners", ActionSetOwners}, {"delete", ActionDelete},
		{"request", ActionRequest}, {"review", ActionReview},
	}
	want := map[string][]bool{
		//             view  update assignees labels owners delete request review
		"creator":  {true, true, true, true, true, true, false, true},
		"owner":    {true, true, true, true, false, true, false, true},
		"assignee": {true, false, false, false, false, false, true, false},
		"viewer":   {true, false, false, false, false, false, false, false},
		// ADR-0021: a workspace owner manages every task.
		"admin": {true, true, true, true, true, true, false, true},
	}
	for user, expected := range want {
		for i, act := range actions {
			t.Run(user+"/"+act.name, func(t *testing.T) {
				access := a
				if user == "admin" {
					access.WorkspaceRole = "OWNER"
				}
				err := Authorize(access, user, act.action)
				if got := err == nil; got != expected[i] {
					t.Fatalf("allowed = %v, want %v", got, expected[i])
				}
				if err != nil && !errors.Is(err, ErrForbidden) && !errors.Is(err, ErrManagerRequest) {
					t.Fatalf("want ErrForbidden, got %v", err)
				}
			})
		}
	}

	v := Evaluate(a, "owner")
	if !v.CanManage || v.CanManageOwners || !v.IsAssignee || v.CanRequest {
		t.Fatalf("owner viewer flags: %+v", v)
	}
	if v := Evaluate(a, "assignee"); v.CanManage || !v.CanRequest {
		t.Fatalf("assignee viewer flags: %+v", v)
	}
}

func TestWrapKeepsNilAndKinds(t *testing.T) {
	if err := wrap("op", nil); err != nil {
		t.Fatalf("wrap(nil) = %v", err)
	}
	if err := wrap("op", ErrNotFound); err != ErrNotFound {
		t.Fatalf("apperr kinds must pass through, got %v", err)
	}
	if err := wrap("op", errors.New("boom")); err == nil || err.Error() != "tasksvc: op: boom" {
		t.Fatalf("wrap(other) = %v", err)
	}
}
