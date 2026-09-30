package tasksvc

import (
	"slices"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/intellicars/list-app/apps/api/internal/apiserver"
	"github.com/intellicars/list-app/apps/api/internal/apperr"
	mdl "github.com/intellicars/list-app/apps/api/internal/modules/task/taskmdl"
)

// Messages mirror the reference app and packages/domain tasks.validators.ts.
const (
	MsgTitleRequired = "Title is required"
	MsgTitleTooLong  = "Title must be 500 characters or fewer"
	MsgDatesRequired = "Start and end date are required"
	MsgEndBeforeStar = "End date must be on or after start date"
	MsgInvalidDate   = "Enter a valid date"
	MsgUnknownStatus = "Choose a valid status"
	MsgUnknownPrio   = "Choose a valid priority"
)

// fields are a task's editable values after merging a request onto the
// current row; validate checks them as a whole (e.g. date ordering).
type fields struct {
	Title       string
	Description *string
	Status      string
	Priority    string
	StartDate   string
	EndDate     string
	DueDate     *string
}

type valid struct {
	Title       string
	Description *string
	Status      string
	Priority    string
	StartDate   time.Time
	EndDate     time.Time
	DueDate     *time.Time
}

func validate(f fields) (valid, error) {
	var errs []apiserver.FieldError
	add := func(field, msg string) { errs = append(errs, apiserver.FieldError{Field: field, Message: msg}) }

	out := valid{Title: strings.TrimSpace(f.Title), Status: f.Status, Priority: f.Priority}
	switch n := utf8.RuneCountInString(out.Title); {
	case n == 0:
		add("title", MsgTitleRequired)
	case n > 500:
		add("title", MsgTitleTooLong)
	}
	if f.Description != nil {
		if d := strings.TrimSpace(*f.Description); d != "" {
			out.Description = &d
		}
	}
	if !slices.Contains(mdl.Statuses, f.Status) {
		add("status", MsgUnknownStatus)
	}
	if !slices.Contains(mdl.Priorities, f.Priority) {
		add("priority", MsgUnknownPrio)
	}

	start, startErr := parseDate(f.StartDate)
	end, endErr := parseDate(f.EndDate)
	switch {
	case f.StartDate == "" || f.EndDate == "":
		if f.StartDate == "" {
			add("startDate", MsgDatesRequired)
		}
		if f.EndDate == "" {
			add("endDate", MsgDatesRequired)
		}
	case startErr != nil:
		add("startDate", MsgInvalidDate)
	case endErr != nil:
		add("endDate", MsgInvalidDate)
	case end.Before(start):
		add("endDate", MsgEndBeforeStar)
	}
	out.StartDate, out.EndDate = start, end

	if f.DueDate != nil && *f.DueDate != "" {
		due, err := parseDate(*f.DueDate)
		if err != nil {
			add("dueDate", MsgInvalidDate)
		}
		out.DueDate = &due
	}

	if len(errs) > 0 {
		return valid{}, &apperr.Validation{Fields: errs}
	}
	return out, nil
}

func parseDate(s string) (time.Time, error) {
	return time.Parse(mdl.DateLayout, s)
}

func orDefault(v, fallback string) string {
	if v == "" {
		return fallback
	}
	return v
}
