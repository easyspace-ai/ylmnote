package persistence

import (
	"errors"
	"os"
)

var gormErrNotFound = errors.New("not found")

// ReadFileSafe 安全地读取文件内容
func ReadFileSafe(path string) ([]byte, error) {
	return os.ReadFile(path)
}
