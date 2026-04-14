package user

// Repository 用户仓储接口（领域层定义，由基础设施实现）
type Repository interface {
	Create(u *User) error
	GetByID(id string) (*User, error)
	GetByUsername(username string) (*User, error)
	GetByEmail(email string) (*User, error)
	// GetByUsernameOrEmail 用同一字段匹配用户名或邮箱（登录表单）
	GetByUsernameOrEmail(value string) (*User, error)
	ExistsByUsernameOrEmail(username, email string) (bool, error)
	Update(u *User) error
}
