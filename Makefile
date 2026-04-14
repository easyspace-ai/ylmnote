# 产物目录：$(ROOT)/bin/server + $(ROOT)/bin/static/
ROOT := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
BIN := $(ROOT)/bin
BACKEND := $(ROOT)/backend
FRONTEND := $(ROOT)/frontend
SERVER_BIN := $(BIN)/server

.PHONY: all frontend backend clean

all: frontend backend

frontend:
	mkdir -p "$(BIN)"
	cd "$(FRONTEND)" && pnpm install && pnpm run build -- --outDir "$(BIN)/static"

backend:
	mkdir -p "$(BIN)"
	cd "$(BACKEND)" && CGO_ENABLED=1 go build -trimpath -o "$(SERVER_BIN)" ./cmd/server

clean:
	rm -rf "$(BIN)/static" "$(SERVER_BIN)"
