package workspacemdl

func ToWorkspaceRsp(w Workspace) WorkspaceRsp {
	return WorkspaceRsp{ID: w.ID, Name: w.Name, Role: w.Role}
}

func ToActiveWorkspaceRsp(w Workspace) *ActiveWorkspaceRsp {
	return &ActiveWorkspaceRsp{ID: w.ID, Name: w.Name, Role: w.Role, InviteCode: w.InviteCode}
}

func ToWorkspaceRspList(ws []Workspace) []WorkspaceRsp {
	out := make([]WorkspaceRsp, 0, len(ws))
	for _, w := range ws {
		out = append(out, ToWorkspaceRsp(w))
	}
	return out
}

func ToMemberRspList(ms []Member) []MemberRsp {
	out := make([]MemberRsp, 0, len(ms))
	for _, m := range ms {
		out = append(out, MemberRsp{ID: m.UserID, Name: m.Name, Email: m.Email, Image: m.ImageURL, Role: m.Role, JoinedAt: m.JoinedAt})
	}
	return out
}
