package persistence

import (
	"github.com/easyspace-ai/ylmnote/internal/domain/project"
)

// PromptTemplateRepository Studio 提示词模板仓储 GORM 实现
type PromptTemplateRepository struct {
	db *DB
}

func NewPromptTemplateRepository(db *DB) project.PromptTemplateRepository {
	return &PromptTemplateRepository{db: db}
}

func (r *PromptTemplateRepository) Create(t *project.PromptTemplate) error {
	return r.db.Create(toPromptTemplateModel(t)).Error
}

func (r *PromptTemplateRepository) ListByUserID(userID string) ([]*project.PromptTemplate, error) {
	var list []PromptTemplateModel
	if err := r.db.Where("user_id = ?", userID).Order("updated_at DESC").Find(&list).Error; err != nil {
		return nil, err
	}
	out := make([]*project.PromptTemplate, len(list))
	for i := range list {
		out[i] = toPromptTemplateEntity(&list[i])
	}
	return out, nil
}

func (r *PromptTemplateRepository) GetByIDAndUserID(id, userID string) (*project.PromptTemplate, error) {
	var model PromptTemplateModel
	if err := r.db.Where("id = ? AND user_id = ?", id, userID).First(&model).Error; err != nil {
		return nil, err
	}
	return toPromptTemplateEntity(&model), nil
}

func (r *PromptTemplateRepository) Update(t *project.PromptTemplate) error {
	model := toPromptTemplateModel(t)
	return r.db.Model(&PromptTemplateModel{}).Where("id = ? AND user_id = ?", t.ID, t.UserID).Updates(model).Error
}

func (r *PromptTemplateRepository) Delete(id, userID string) error {
	res := r.db.Where("id = ? AND user_id = ?", id, userID).Delete(&PromptTemplateModel{})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return gormErrNotFound
	}
	return nil
}

func (r *PromptTemplateRepository) CountByUserID(userID string) (int64, error) {
	var count int64
	if err := r.db.Model(&PromptTemplateModel{}).Where("user_id = ?", userID).Count(&count).Error; err != nil {
		return 0, err
	}
	return count, nil
}

func toPromptTemplateModel(t *project.PromptTemplate) *PromptTemplateModel {
	return &PromptTemplateModel{
		ID:         t.ID,
		UserID:     t.UserID,
		ActionType: t.ActionType,
		Name:       t.Name,
		Prompt:     t.Prompt,
		CreatedAt:  t.CreatedAt,
		UpdatedAt:  t.UpdatedAt,
	}
}

func toPromptTemplateEntity(m *PromptTemplateModel) *project.PromptTemplate {
	return &project.PromptTemplate{
		ID:         m.ID,
		UserID:     m.UserID,
		ActionType: m.ActionType,
		Name:       m.Name,
		Prompt:     m.Prompt,
		CreatedAt:  m.CreatedAt,
		UpdatedAt:  m.UpdatedAt,
	}
}
