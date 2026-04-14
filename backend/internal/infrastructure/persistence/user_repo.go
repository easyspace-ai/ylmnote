package persistence

import (
	"time"

	"github.com/easyspace-ai/ylmnote/internal/domain/user"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// UserRepository 用户仓储 GORM 实现
type UserRepository struct {
	db *DB
}

func NewUserRepository(db *DB) user.Repository {
	return &UserRepository{db: db}
}

func (r *UserRepository) Create(u *user.User) error {
	m := toUserModel(u)
	return r.db.Create(m).Error
}

func (r *UserRepository) GetByID(id string) (*user.User, error) {
	var m UserModel
	if err := r.db.Where("id = ?", id).First(&m).Error; err != nil {
		return nil, err
	}
	return toUserEntity(&m), nil
}

func (r *UserRepository) GetByUsername(username string) (*user.User, error) {
	var m UserModel
	if err := r.db.Where("username = ?", username).First(&m).Error; err != nil {
		return nil, err
	}
	return toUserEntity(&m), nil
}

func (r *UserRepository) GetByEmail(email string) (*user.User, error) {
	var m UserModel
	if err := r.db.Where("email = ?", email).First(&m).Error; err != nil {
		return nil, err
	}
	return toUserEntity(&m), nil
}

func (r *UserRepository) GetByUsernameOrEmail(value string) (*user.User, error) {
	var m UserModel
	if err := r.db.Where("username = ? OR email = ?", value, value).First(&m).Error; err != nil {
		return nil, err
	}
	return toUserEntity(&m), nil
}

func (r *UserRepository) ExistsByUsernameOrEmail(username, email string) (bool, error) {
	var count int64
	err := r.db.Model(&UserModel{}).Where("username = ? OR email = ?", username, email).Count(&count).Error
	return count > 0, err
}

func (r *UserRepository) Update(u *user.User) error {
	m := toUserModel(u)
	return r.db.Save(m).Error
}

// ChargeCredits 原子扣减积分并记流水；amount 为正数时表示要扣的积分数（内部写入 transactions.amount 为负）。
func (r *UserRepository) ChargeCredits(userID string, amount int, reason string, projectID, messageID, modelID *string) error {
	if amount <= 0 {
		return nil
	}
	return r.db.Transaction(func(tx *gorm.DB) error {
		res := tx.Exec(`
			UPDATE users
			SET credits_balance = credits_balance - ?, credits_used = credits_used + ?
			WHERE id = ? AND credits_balance >= ?`,
			amount, amount, userID, amount)
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return user.ErrInsufficientCredits
		}
		row := TransactionModel{
			ID:        uuid.NewString(),
			UserID:    userID,
			Amount:    -amount,
			Reason:    reason,
			ProjectID: projectID,
			MessageID: messageID,
			ModelID:   modelID,
			CreatedAt: time.Now().UTC(),
		}
		return tx.Create(&row).Error
	})
}

func toUserModel(u *user.User) *UserModel {
	return &UserModel{
		ID:               u.ID,
		Username:         u.Username,
		Email:            u.Email,
		HashedPassword:   u.HashedPassword,
		SubscriptionPlan: u.SubscriptionPlan,
		CreditsBalance:   u.CreditsBalance,
		CreditsUsed:      u.CreditsUsed,
		CreatedAt:        u.CreatedAt,
	}
}

func toUserEntity(m *UserModel) *user.User {
	return &user.User{
		ID:               m.ID,
		Username:         m.Username,
		Email:            m.Email,
		HashedPassword:   m.HashedPassword,
		SubscriptionPlan: m.SubscriptionPlan,
		CreditsBalance:   m.CreditsBalance,
		CreditsUsed:      m.CreditsUsed,
		CreatedAt:        m.CreatedAt,
	}
}
