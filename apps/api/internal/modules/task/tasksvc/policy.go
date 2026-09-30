package tasksvc

import (
	"slices"

	"github.com/intellicars/list-app/apps/api/internal/apperr"
	mdl "github.com/intellicars/list-app/apps/api/internal/modules/task/taskmdl"
)

// Action is something a caller may try to do to a task.
type Action int

const (
	ActionView Action = iota
	ActionUpdate
	ActionSetAssignees
	ActionSetLabels
	ActionSetOwners
	ActionDelete
	// ActionRequest proposes a change; ActionReview approves or rejects one.
	ActionRequest
	ActionReview
)

// Access is what the policy needs to know about a task and the caller.
type Access struct {
	CreatedBy   string
	OwnerIDs    []string
	AssigneeIDs []string
	// WorkspaceRole is the caller's role in the task's workspace.
	WorkspaceRole string
}

func accessOf(t mdl.Task, c Caller) Access {
	a := Access{CreatedBy: t.CreatedBy.ID, WorkspaceRole: c.Role}
	for _, p := range t.Owners {
		a.OwnerIDs = append(a.OwnerIDs, p.ID)
	}
	for _, p := range t.Assignees {
		a.AssigneeIDs = append(a.AssigneeIDs, p.ID)
	}
	return a
}

// Evaluate is the single task permission policy (E5-S1; ADR-0020, ADR-0021),
// shared by the API response (`viewer`) and enforcement (Authorize):
//   - workspace OWNER: manages every task, including its owners (ADR-0021)
//   - creator: manages the task and its owners
//   - task owner: manages the task, not its owners
//   - assignees who can't manage propose changes as requests (E5-S2)
//   - everyone else in the workspace can view.
func Evaluate(a Access, userID string) mdl.Viewer {
	isAdmin := a.WorkspaceRole == "OWNER"
	isCreator := a.CreatedBy == userID
	isOwner := slices.Contains(a.OwnerIDs, userID)
	canManage := isAdmin || isCreator || isOwner
	isAssignee := slices.Contains(a.AssigneeIDs, userID)
	return mdl.Viewer{
		CanManage:       canManage,
		CanManageOwners: isAdmin || isCreator,
		IsAssignee:      isAssignee,
		CanRequest:      isAssignee && !canManage,
	}
}

var ErrManagerRequest = &apperr.Forbidden{Detail: "You can change this task directly."}

var ErrForbidden = &apperr.Forbidden{Detail: "You can't change this task. Ask its creator or an owner."}

// Authorize returns ErrForbidden unless the policy allows action.
func Authorize(a Access, userID string, action Action) error {
	v := Evaluate(a, userID)
	allowed := false
	switch action {
	case ActionView:
		allowed = true
	case ActionUpdate, ActionSetAssignees, ActionSetLabels, ActionDelete, ActionReview:
		allowed = v.CanManage
	case ActionRequest:
		if v.CanManage {
			return ErrManagerRequest
		}
		allowed = v.CanRequest
	case ActionSetOwners:
		allowed = v.CanManageOwners
	}
	if !allowed {
		return ErrForbidden
	}
	return nil
}
