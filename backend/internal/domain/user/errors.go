package user

import "errors"

// ErrInsufficientCredits 用户积分不足以完成本次对话扣费。
var ErrInsufficientCredits = errors.New("insufficient credits")
