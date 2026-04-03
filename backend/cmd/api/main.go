package main

import (
	"log"

	"github.com/ashwinshanmugam/caprio/backend/internal/config"
	httproutes "github.com/ashwinshanmugam/caprio/backend/internal/http"
)

func main() {
	cfg := config.Load()

	router := httproutes.NewRouter()

	addr := ":" + cfg.Port
	log.Printf("listening on %s", addr)
	if err := router.Run(addr); err != nil {
		log.Fatal(err)
	}
}

