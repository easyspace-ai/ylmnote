package persistence

import (
	"encoding/json"

	"gorm.io/gorm"

	"github.com/easyspace-ai/ylmnote/internal/domain/project"
)

// MessageRepository 消息仓储 GORM 实现
type MessageRepository struct {
	db *DB
}

func NewMessageRepository(db *DB) project.MessageRepository {
	return &MessageRepository{db: db}
}

func (r *MessageRepository) Create(m *project.Message) error {
	mod := toMessageModel(m)
	return r.db.Create(mod).Error
}

func (r *MessageRepository) UpsertByUpstreamID(m *project.Message) (*project.Message, error) {
	upstreamID := ""
	if m.UpstreamID != nil {
		upstreamID = *m.UpstreamID
	}
	if upstreamID == "" {
		if err := r.Create(m); err != nil {
			return nil, err
		}
		return m, nil
	}
	var mod MessageModel
	err := r.db.Where("session_id = ? AND upstream_message_id = ?", m.SessionID, upstreamID).First(&mod).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			if createErr := r.Create(m); createErr != nil {
				return nil, createErr
			}
			return m, nil
		}
		return nil, err
	}
	mod.Role = m.Role
	mod.Content = m.Content
	mod.ProjectID = m.ProjectID
	mod.SkillID = m.SkillID
	mod.CreatedAt = m.CreatedAt
	if m.Attachments != nil {
		data, _ := json.Marshal(m.Attachments)
		mod.Attachments = string(data)
	} else {
		mod.Attachments = ""
	}
	if err := r.db.Save(&mod).Error; err != nil {
		return nil, err
	}
	return toMessageEntity(&mod), nil
}

func (r *MessageRepository) GetByID(projectID, messageID string) (*project.Message, error) {
	var mod MessageModel
	err := r.db.Where("id = ? AND project_id = ?", messageID, projectID).First(&mod).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, gormErrNotFound
		}
		return nil, err
	}
	return toMessageEntity(&mod), nil
}

func (r *MessageRepository) ListByProjectID(projectID string, skip, limit int) ([]*project.Message, error) {
	var list []MessageModel
	if err := r.db.Where("project_id = ?", projectID).Order("created_at ASC").Offset(skip).Limit(limit).Find(&list).Error; err != nil {
		return nil, err
	}
	out := make([]*project.Message, len(list))
	for i := range list {
		out[i] = toMessageEntity(&list[i])
	}
	return out, nil
}

func (r *MessageRepository) ListBySessionID(sessionID string, skip, limit int) ([]*project.Message, error) {
	var list []MessageModel
	if err := r.db.Where("session_id = ?", sessionID).Order("created_at DESC, id DESC").Offset(skip).Limit(limit).Find(&list).Error; err != nil {
		return nil, err
	}
	// 接口仍返回时间正序，便于前端直接渲染；查询侧优先拿“最新窗口”。
	for i, j := 0, len(list)-1; i < j; i, j = i+1, j-1 {
		list[i], list[j] = list[j], list[i]
	}
	out := make([]*project.Message, len(list))
	for i := range list {
		out[i] = toMessageEntity(&list[i])
	}
	return out, nil
}

func (r *MessageRepository) UpdateContent(projectID, messageID, content string) (*project.Message, error) {
	var mod MessageModel
	if err := r.db.Where("id = ? AND project_id = ?", messageID, projectID).First(&mod).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, err
	}
	mod.Content = content
	if err := r.db.Save(&mod).Error; err != nil {
		return nil, err
	}
	return toMessageEntity(&mod), nil
}

func (r *MessageRepository) Delete(projectID, messageID string) error {
	res := r.db.Where("id = ? AND project_id = ?", messageID, projectID).Delete(&MessageModel{})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return gormErrNotFound
	}
	return nil
}

func toMessageModel(m *project.Message) *MessageModel {
	mod := &MessageModel{
		ID:         m.ID,
		UpstreamID: m.UpstreamID,
		ProjectID:  m.ProjectID,
		SessionID:  m.SessionID,
		Role:       m.Role,
		Content:    m.Content,
		SkillID:    m.SkillID,
		CreatedAt:  m.CreatedAt,
	}
	if m.Attachments != nil {
		data, _ := json.Marshal(m.Attachments)
		mod.Attachments = string(data)
	}
	return mod
}

func toMessageEntity(m *MessageModel) *project.Message {
	ent := &project.Message{
		ID:         m.ID,
		UpstreamID: m.UpstreamID,
		ProjectID:  m.ProjectID,
		SessionID:  m.SessionID,
		Role:       m.Role,
		Content:    m.Content,
		SkillID:    m.SkillID,
		CreatedAt:  m.CreatedAt,
	}
	if m.Attachments != "" {
		_ = json.Unmarshal([]byte(m.Attachments), &ent.Attachments)
	}
	return ent
}
