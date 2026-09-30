package taskmdl

import "time"

const DateLayout = "2006-01-02"

func dateOrNil(t *time.Time) *string {
	if t == nil {
		return nil
	}
	s := t.Format(DateLayout)
	return &s
}

func ToTaskSummaryRsp(t Task) TaskSummaryRsp {
	return TaskSummaryRsp{
		ID: t.ID, Title: t.Title, Status: t.Status, Priority: t.Priority,
		StartDate: t.StartDate.Format(DateLayout), EndDate: t.EndDate.Format(DateLayout), DueDate: dateOrNil(t.DueDate),
		Assignees: t.Assignees, Labels: t.Labels, CreatedBy: t.CreatedBy, Version: t.Version, UpdatedAt: t.UpdatedAt,
		Client: t.Client, Parent: t.Parent, Counts: t.Counts,
	}
}

func ToTaskSummaryRspList(ts []Task) []TaskSummaryRsp {
	out := make([]TaskSummaryRsp, 0, len(ts))
	for _, t := range ts {
		out = append(out, ToTaskSummaryRsp(t))
	}
	return out
}

func ToTaskRsp(t Task, v Viewer) TaskRsp {
	return TaskRsp{
		ID: t.ID, Title: t.Title, Description: t.Description, Status: t.Status, Priority: t.Priority,
		StartDate: t.StartDate.Format(DateLayout), EndDate: t.EndDate.Format(DateLayout), DueDate: dateOrNil(t.DueDate),
		Assignees: t.Assignees, Owners: t.Owners, Labels: t.Labels, CreatedBy: t.CreatedBy,
		CreatedAt: t.CreatedAt, UpdatedAt: t.UpdatedAt, Version: t.Version, Viewer: v,
		Client: t.Client, Parent: t.Parent,
		Subtasks: nonNil(t.Subtasks), Checklist: nonNil(t.Checklist), Comments: nonNil(t.Comments), Attachments: nonNil(t.Attachments),
	}
}

// nonNil keeps empty lists as [] (not null) in JSON.
func nonNil[T any](xs []T) []T {
	if xs == nil {
		return []T{}
	}
	return xs
}
