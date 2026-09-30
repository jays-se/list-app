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
	}
	want := map[string][]bool{
		//             view  update assignees labels owners delete
		"creator":  {true, true, true, true, true, true},
		"owner":    {true, true, true, true, false, true},
		"assignee": {true, false, false, false, false, false},
		"viewer":   {true, false, false, false, false, false},
	}
	for user, expected := range want {
		for i, act := range actions {
			t.Run(user+"/"+act.name, func(t *testing.T) {
				err := Authorize(a, user, act.action)
				if got := err == nil; got != expected[i] {
					t.Fatalf("allowed = %v, want %v", got, expected[i])
				}
				if err != nil && !errors.Is(err, ErrForbidden) {
					t.Fatalf("want ErrForbidden, got %v", err)
				}
			})
		}
	}

	v := Evaluate(a, "owner")
	if !v.CanManage || v.CanManageOwners || !v.IsAssignee {
		t.Fatalf("owner viewer flags: %+v", v)
	}
}
