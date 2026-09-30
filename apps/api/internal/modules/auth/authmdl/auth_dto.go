package authmdl

func ToUserRsp(u User) UserRsp {
	return UserRsp{ID: u.ID, Name: u.Name, Email: u.Email, Image: u.ImageURL}
}
