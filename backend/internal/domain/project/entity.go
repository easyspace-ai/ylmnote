package project

import "time"

// Project 笔记聚合根
type Project struct {
	ID          string
	UserID      string
	Name        string
	Description *string
	CoverImage  *string
	Status      string
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

// Session 会话实体（属于笔记，一个笔记下可有多个会话）
type Session struct {
	ID        string
	ProjectID string
	Title     string
	CreatedAt time.Time
	UpdatedAt time.Time
}

// Message 消息实体（属于会话，会话属于笔记）
type Message struct {
	ID          string
	UpstreamID  *string
	ProjectID   string
	SessionID   string
	Role        string
	Content     string
	SkillID     *string
	Attachments map[string]interface{}
	CreatedAt   time.Time
}

// Resource 资源实体（属于笔记聚合）
type Resource struct {
	ID        string
	ProjectID string
	SessionID *string
	Type      string
	Name      string
	Content   *string
	URL       *string
	Size      *string
	CreatedAt time.Time
}

// PromptTemplate Studio 动作提示词模板（全局，按用户隔离）
type PromptTemplate struct {
	ID         string
	UserID     string
	ActionType string
	Name       string
	Prompt     string
	CreatedAt  time.Time
	UpdatedAt  time.Time
}
