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
)

// Access is what the policy needs to know about a task.
type Access struct {
	CreatedBy   string
	OwnerIDs    []string
	AssigneeIDs []string
}

func accessOf(t mdl.Task) Access {
	a := Access{CreatedBy: t.CreatedBy.ID}
	for _, p := range t.Owners {
		a.OwnerIDs = append(a.OwnerIDs, p.ID)
	}
	for _, p := range t.Assignees {
		a.AssigneeIDs = append(a.AssigneeIDs, p.ID)
	}
	return a
}

// Evaluate is the single task permission policy (E5-S1), shared by the API
// response (`viewer`) and enforcement (Authorize). Reference behaviour:
//   - manage (edit fields, assignees, labels, delete): the creator or an owner
//   - manage owners: the creator only
//   - everyone else in the workspace can view. Assignees who can't manage will
//     use change requests (E5-S2); until then they view.
func Evaluate(a Access, userID string) mdl.Viewer {
	isCreator := a.CreatedBy == userID
	isOwner := slices.Contains(a.OwnerIDs, userID)
	return mdl.Viewer{
		CanManage:       isCreator || isOwner,
		CanManageOwners: isCreator,
		IsAssignee:      slices.Contains(a.AssigneeIDs, userID),
	}
}

var ErrForbidden = &apperr.Forbidden{Detail: "You can't change this task. Ask its creator or an owner."}

// Authorize returns ErrForbidden unless the policy allows action.
func Authorize(a Access, userID string, action Action) error {
	v := Evaluate(a, userID)
	allowed := false
	switch action {
	case ActionView:
		allowed = true
	case ActionUpdate, ActionSetAssignees, ActionSetLabels, ActionDelete:
		allowed = v.CanManage
	case ActionSetOwners:
		allowed = v.CanManageOwners
	}
	if !allowed {
		return ErrForbidden
	}
	return nil
}
