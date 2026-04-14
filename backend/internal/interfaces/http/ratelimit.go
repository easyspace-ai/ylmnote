package http

import (
	"net/http"
	"sync"

	"github.com/gin-gonic/gin"
	"golang.org/x/time/rate"
)

// minuteLimiter 按 IP 的令牌桶：每分钟 perMinute 次（平滑到每秒 perMinute/60）。
type minuteLimiter struct {
	mu    sync.Mutex
	ips   map[string]*rate.Limiter
	limit rate.Limit
	burst int
}

func newMinuteLimiter(perMinute int) *minuteLimiter {
	if perMinute < 1 {
		perMinute = 60
	}
	lim := rate.Limit(float64(perMinute) / 60.0)
	burst := perMinute
	if burst > 200 {
		burst = 200
	}
	return &minuteLimiter{
		ips:   make(map[string]*rate.Limiter),
		limit: lim,
		burst: burst,
	}
}

func (m *minuteLimiter) limiterFor(ip string) *rate.Limiter {
	m.mu.Lock()
	defer m.mu.Unlock()
	l, ok := m.ips[ip]
	if !ok {
		l = rate.NewLimiter(m.limit, m.burst)
		m.ips[ip] = l
	}
	return l
}

func (m *minuteLimiter) Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !m.limiterFor(c.ClientIP()).Allow() {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"detail": "rate limit exceeded"})
			return
		}
		c.Next()
	}
}
