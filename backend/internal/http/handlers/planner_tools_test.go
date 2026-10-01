package handlers_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http/httptest"
	"testing"

	"github.com/ashwinshanmugam/caprio/backend/internal/http/handlers"
	"github.com/ashwinshanmugam/caprio/backend/internal/mastra"
	"github.com/ashwinshanmugam/caprio/backend/internal/services/chat"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// toolCallingAgent calls add_task over HTTP, as the Mastra tools do.
type toolCallingAgent struct {
	router  *gin.Engine
	secret  string
	status  []int
	results []map[string]any
}

func (a *toolCallingAgent) post(token, secret string) (int, map[string]any) {
	req := httptest.NewRequest("POST", "/internal/planner/tools/add_task", bytes.NewReader([]byte(`{"title":"Ship slides"}`)))
	req.Header.Set("X-Caprio-Internal", secret)
	req.Header.Set("X-Caprio-Turn", token)
	res := httptest.NewRecorder()
	a.router.ServeHTTP(res, req)
	var body map[string]any
	_ = json.Unmarshal(res.Body.Bytes(), &body)
	return res.Code, body
}

func (a *toolCallingAgent) Chat(_ context.Context, call mastra.Call) (*mastra.ChatResponse, error) {
	token := call.RequestContext["turnToken"].(string)
	for _, attempt := range []struct{ token, secret string }{{token, "wrong"}, {"forged.token", a.secret}, {token, a.secret}} {
		code, body := a.post(attempt.token, attempt.secret)
		a.status, a.results = append(a.status, code), append(a.results, body)
	}
	return &mastra.ChatResponse{Message: "Slides are on for today."}, nil
}

func TestPlannerToolsAcceptOnlyTheAgentDuringItsTurn(t *testing.T) {
	r, store, _ := setupWorkflowHTTP(t)
	const secret = "planner-secret"
	agent := &toolCallingAgent{router: r, secret: secret}
	service := chat.NewService(store, agent, chat.WithToolSecret(secret))
	r.POST("/internal/planner/tools/:name", handlers.PlannerToolAuth(secret), handlers.NewPlannerToolHandler(service).Apply)
	h := handlers.NewChatHandler(store, service)
	r.POST("/test/chat", h.SendMessage)
	reply := httpJSON(t, r, "POST", "/test/chat", map[string]any{"content": "Add ship slides", "date": "2090-09-06", "requestId": uuid.NewString()}, 200)
	require.Equal(t, []int{401, 403, 200}, agent.status)
	require.Equal(t, true, agent.results[2]["ok"])
	require.Equal(t, "added", agent.results[2]["status"])
	plan := reply["workflow"].(map[string]any)["plan"].(map[string]any)
	require.Equal(t, "Ship slides", plan["today"].([]any)[0].(map[string]any)["title"])
	after, _ := agent.post("any", secret)
	require.Equal(t, 403, after, "no turn is in progress")
	closed := gin.New()
	closed.POST("/internal/planner/tools/:name", handlers.PlannerToolAuth(""), handlers.NewPlannerToolHandler(service).Apply)
	res := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/internal/planner/tools/add_task", bytes.NewReader([]byte(`{}`)))
	closed.ServeHTTP(res, req)
	require.Equal(t, 401, res.Code, "without a configured secret the endpoint is closed")
}
