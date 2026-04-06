package main

import (
	"context"
	"log"

	"github.com/ashwinshanmugam/caprio/backend/internal/config"
	"github.com/ashwinshanmugam/caprio/backend/internal/db"
	httproutes "github.com/ashwinshanmugam/caprio/backend/internal/http"
)

func main() {
	cfg := config.Load()

	ctx := context.Background()

	pool, err := db.NewPool(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("failed to connect to database: %v", err)
	}
	defer pool.Close()
	log.Println("connected to database")

	store := db.NewStore(pool)

	router := httproutes.NewRouter(cfg, store.Queries)

	addr := ":" + cfg.Port
	log.Printf("listening on %s", addr)
	if err := router.Run(addr); err != nil {
		log.Fatal(err)
	}
}

