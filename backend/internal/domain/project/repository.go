package project

// ProjectRepository 笔记仓储接口
type ProjectRepository interface {
	Create(p *Project) error
	GetByID(id string) (*Project, error)
	GetByIDAndUserID(id, userID string) (*Project, error)
	ListByUserID(userID string, status *string, skip, limit int) ([]*Project, error)
	Update(p *Project) error
	Delete(id, userID string) error
}

// SessionRepository 会话仓储接口
type SessionRepository interface {
	Create(s *Session) error
	GetByID(id string) (*Session, error)
	GetByIDAndProjectID(id, projectID string) (*Session, error)
	ListByProjectID(projectID string, skip, limit int) ([]*Session, error)
	Update(s *Session) error
	Delete(id, projectID string) error
}

// MessageRepository 消息仓储接口
type MessageRepository interface {
	Create(m *Message) error
	UpsertByUpstreamID(m *Message) (*Message, error)
	GetByID(projectID, messageID string) (*Message, error)
	ListByProjectID(projectID string, skip, limit int) ([]*Message, error)
	ListBySessionID(sessionID string, skip, limit int) ([]*Message, error)
	UpdateContent(projectID, messageID, content string) (*Message, error)
	Delete(projectID, messageID string) error
}

// ResourceRepository 资源仓储接口
type ResourceRepository interface {
	Create(r *Resource) error
	GetByID(projectID, resourceID string) (*Resource, error)
	ListByProjectID(projectID string, resourceType *string) ([]*Resource, error)
	Update(r *Resource) error
	Delete(projectID, resourceID string) error
}

// PromptTemplateRepository Studio 提示词模板仓储接口
type PromptTemplateRepository interface {
	Create(t *PromptTemplate) error
	ListByUserID(userID string) ([]*PromptTemplate, error)
	GetByIDAndUserID(id, userID string) (*PromptTemplate, error)
	Update(t *PromptTemplate) error
	Delete(id, userID string) error
	CountByUserID(userID string) (int64, error)
}
