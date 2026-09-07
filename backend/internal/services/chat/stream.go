package chat

import (
	"bytes"
	"context"
	"unicode/utf16"
	"unicode/utf8"

	"github.com/ashwinshanmugam/caprio/backend/internal/mastra"
)

// StreamingAgent is implemented by agents that can deliver a reply incrementally.
// onDelta receives raw fragments of the model output in order.
type StreamingAgent interface {
	StreamChat(ctx context.Context, messages []mastra.ChatMessage, threadID, resourceID, model string, onDelta func(string)) (*mastra.ChatResponse, error)
}

// callAgent prefers streaming when both sides support it. The user only ever
// sees the "message" field of the planning contract, never the raw JSON.
func (s *Service) callAgent(ctx context.Context, messages []mastra.ChatMessage, threadID, resourceID, model string, onDelta func(string)) (*mastra.ChatResponse, error) {
	if streamer, ok := s.agent.(StreamingAgent); ok && onDelta != nil {
		return streamer.StreamChat(ctx, messages, threadID, resourceID, model, newMessageExtractor(onDelta).Feed)
	}
	return s.agent.Chat(ctx, messages, threadID, resourceID, model)
}

// extractorLimit matches the size ParseAgentReply is willing to accept.
const extractorLimit = 100000

var messageKey = []byte(`"message"`)

// messageExtractor decodes the "message" string of the reply while the JSON is
// still arriving, so the text can be shown before the whole proposal exists.
// It tolerates fragments that split the key, an escape sequence, a surrogate
// pair, or a multi-byte rune. Nothing after the closing quote is forwarded.
type messageExtractor struct {
	emit  func(string)
	buf   []byte
	pos   int
	state extractorState
}

type extractorState int

const (
	seekingKey extractorState = iota
	insideString
	finished
)

func newMessageExtractor(emit func(string)) *messageExtractor {
	return &messageExtractor{emit: emit}
}

// Feed appends a fragment of the raw reply and emits newly decoded message text.
func (m *messageExtractor) Feed(delta string) {
	if m.state == finished || m.emit == nil {
		return
	}
	m.buf = append(m.buf, delta...)
	if m.state == seekingKey && !m.locate() {
		if len(m.buf) > extractorLimit {
			m.state = finished
		}
		return
	}
	if out := m.decode(); len(out) > 0 {
		m.emit(string(out))
	}
	if m.state != finished && len(m.buf) > extractorLimit {
		m.state = finished
	}
}

// locate advances to the first byte of the message string body.
func (m *messageExtractor) locate() bool {
	for {
		idx := bytes.Index(m.buf[m.pos:], messageKey)
		if idx < 0 {
			// A key split across fragments must still be found next time.
			if keep := len(m.buf) - len(messageKey) + 1; keep > m.pos {
				m.pos = keep
			}
			return false
		}
		start := m.pos + idx
		i := skipSpace(m.buf, start+len(messageKey))
		if i >= len(m.buf) {
			return false
		}
		if m.buf[i] != ':' {
			m.pos = start + 1
			continue
		}
		i = skipSpace(m.buf, i+1)
		if i >= len(m.buf) {
			return false
		}
		if m.buf[i] != '"' {
			m.pos = start + 1
			continue
		}
		m.pos = i + 1
		m.state = insideString
		return true
	}
}

// decode returns every complete character available since the last call.
func (m *messageExtractor) decode() []byte {
	var out []byte
	for m.pos < len(m.buf) {
		c := m.buf[m.pos]
		switch {
		case c == '"':
			m.state = finished
			return out
		case c == '\\':
			r, size, ok := decodeEscape(m.buf[m.pos:])
			if !ok {
				return out
			}
			out = utf8.AppendRune(out, r)
			m.pos += size
		case c < utf8.RuneSelf:
			out = append(out, c)
			m.pos++
		default:
			if !utf8.FullRune(m.buf[m.pos:]) {
				return out
			}
			r, size := utf8.DecodeRune(m.buf[m.pos:])
			out = utf8.AppendRune(out, r)
			m.pos += size
		}
	}
	return out
}

// decodeEscape decodes the JSON escape at the start of b. ok is false when the
// sequence is not complete yet.
func decodeEscape(b []byte) (r rune, size int, ok bool) {
	if len(b) < 2 {
		return 0, 0, false
	}
	switch b[1] {
	case '"':
		return '"', 2, true
	case '\\':
		return '\\', 2, true
	case '/':
		return '/', 2, true
	case 'b':
		return '\b', 2, true
	case 'f':
		return '\f', 2, true
	case 'n':
		return '\n', 2, true
	case 'r':
		return '\r', 2, true
	case 't':
		return '\t', 2, true
	case 'u':
		if len(b) < 6 {
			return 0, 0, false
		}
		r, valid := hex4(b[2:6])
		if !valid {
			return utf8.RuneError, 6, true
		}
		if !utf16.IsSurrogate(r) {
			return r, 6, true
		}
		if r >= 0xDC00 {
			return utf8.RuneError, 6, true
		}
		if len(b) >= 7 && b[6] != '\\' {
			return utf8.RuneError, 6, true
		}
		if len(b) < 12 {
			return 0, 0, false
		}
		if b[7] == 'u' {
			if low, valid := hex4(b[8:12]); valid {
				if pair := utf16.DecodeRune(r, low); pair != utf8.RuneError {
					return pair, 12, true
				}
			}
		}
		return utf8.RuneError, 6, true
	default:
		return utf8.RuneError, 2, true
	}
}

func hex4(b []byte) (rune, bool) {
	var r rune
	for _, c := range b {
		r <<= 4
		switch {
		case c >= '0' && c <= '9':
			r |= rune(c - '0')
		case c >= 'a' && c <= 'f':
			r |= rune(c-'a') + 10
		case c >= 'A' && c <= 'F':
			r |= rune(c-'A') + 10
		default:
			return 0, false
		}
	}
	return r, true
}

func skipSpace(b []byte, i int) int {
	for i < len(b) && (b[i] == ' ' || b[i] == '\t' || b[i] == '\n' || b[i] == '\r') {
		i++
	}
	return i
}
