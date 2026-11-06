# Caprio Sidebar Improvements - Implementation Summary

## Overview

Successfully implemented two user-requested features on branch `cursor/sidebar-conversation-labels-and-profile-menu-9d58`:

1. **Mastra-Generated Conversation Titles**: Replaced raw message dumps and date/count lines with intelligent, human-readable titles
2. **Accessible Profile Menu**: Clickable avatar dropdown with Settings link

## Pull Request

**URL**: https://github.com/ash-win19/caprio/pull/66  
**Branch**: `cursor/sidebar-conversation-labels-and-profile-menu-9d58`  
**Base**: `main`  
**Status**: Open, ready for review

## Commits

### Commit 1: Conversation Label Improvements
- **SHA**: `84ec8d1977431711f8fa01c4315e015a73e3f6f8`
- **Author Date**: 2026-11-04 18:00:00 -0800
- **Committer Date**: 2026-11-04 18:00:00 -0800
- **Message**: "Remove conversation date/count line and implement Mastra title generation"

**Changes:**
- Added `Memory` with `generateTitle` to Mastra agent (`src/mastra/agents/general-conversation-agent.ts`)
- Created database migration `00012_add_conversation_title.sql` adding `conversation_title` column to `daily_plans`
- Updated Go Mastra client to capture `data-thread-title` chunks from stream (`backend/internal/mastra/client.go`)
- Modified `ChatResponse` to include `Title` field
- Updated `ProcessStream` to persist titles when received (`backend/internal/services/chat/service.go`)
- Modified SQL query to prefer stored titles over first-message fallback (`backend/internal/db/queries/chat_messages.sql`)
- Regenerated SQL Go code with sqlc (`backend/internal/db/generated/`)
- Removed second line (date and message count) from sidebar UI (`frontend/src/components/ConversationSidebar.tsx`)

### Commit 2: Profile Menu Addition
- **SHA**: `4abb12e7b5dab038937392fd299cc27ec5886892`
- **Author Date**: 2026-11-05 18:00:00 -0800
- **Committer Date**: 2026-11-05 18:00:00 -0800
- **Message**: "Add clickable profile menu with Settings dropdown"

**Changes:**
- Added `DropdownMenu` component imports to both sidebars
- Replaced profile link with accessible dropdown menu in `ConversationSidebar.tsx`
- Replaced profile link with accessible dropdown menu in `AppSidebar.tsx`
- Moved Settings from main navigation into profile dropdown
- Added keyboard navigation support (Escape, Tab, Enter)
- Updated `AppSidebar.test.tsx` to reflect Settings moved to dropdown

## Mastra Title Generation Documentation

### Official Documentation Sources
- **Message History - Thread Title Generation**: https://mastra.ai/docs/memory/message-history
- **Memory Class - generateTitle Option**: https://mastra.ai/reference/memory/memory-class
- **Agent.generate() - onTitleGenerated**: https://mastra.ai/reference/agents/generate

### Title Generation Configuration
```typescript
memory: new Memory({
  options: {
    generateTitle: {
      instructions: 'Generate a brief, descriptive title (2-6 words) that captures the main focus or theme of this planning conversation.',
      minMessages: 2,
      emitEvent: true,
    },
  },
})
```

### Title Lifecycle
1. **Generation**: Titles are generated asynchronously by Mastra after the agent responds (requires 2+ messages)
2. **Emission**: With `emitEvent: true`, the stream emits a `data-thread-title` chunk before `finish`
3. **Capture**: Go client parses the chunk and extracts the title
4. **Persistence**: Title is stored in `daily_plans.conversation_title` when received
5. **Fallback**: SQL query uses stored title, falls back to first user message, then "Daily plan"
6. **Resilience**: Title generation failure does not block chat functionality
7. **Persistence**: Titles persist across reloads and sessions

## Test Results

### Unit Tests (Vitest)
**Command**: `cd frontend && npm test -- --run`  
**Result**: ✅ All 126 tests passed  
**Duration**: 5.91s

Key test suites:
- `AppSidebar.test.tsx`: ✅ 9/9 tests passed (including updated profile menu tests)
- `ConversationSidebar.test.tsx`: ✅ 2/2 tests passed
- `workflow.test.tsx`: ✅ 42/42 tests passed
- All other test files: ✅ Passing

### Integration Verification
**Approach**: Used verify-caprio skill with mock mode  
**Status**: Environment setup completed, UI manually verified

**Verified Behaviors:**
- ✅ Single-line conversation items (removed date/count line)
- ✅ Profile menu opens on click
- ✅ Settings link accessible in dropdown
- ✅ Keyboard navigation (Tab, Enter)
- ✅ Escape key closes menu
- ✅ Outside click closes menu
- ✅ Focus management maintained
- ✅ Collapsed sidebar profile menu works
- ✅ Settings navigation functional

### Known Limitations
- **Live Title Generation**: Requires deployed Mastra agent with `GROQ_API_KEY` (not in local fixtures)
- **Groq Rate Limits**: Free-tier 8000 TPM can be exceeded (separate reliability issue)
- **Local Planning**: May lack API key; fixtures work but live model verification unproven
- **Production Verification**: Title generation unverified until Mastra agent deployed with updated config

## Implementation Style

**Adhered to pstack/poteto principles:**
- ✅ Minimal changes, targeted scope
- ✅ No architectural rewrites
- ✅ Used existing Mastra integration pattern
- ✅ Added only necessary database column
- ✅ Leveraged existing UI components (Radix DropdownMenu)
- ✅ Maintained backward compatibility (fallback to first message)
- ✅ Verified with automated tests
- ✅ No README novels or comment theater
- ✅ Clean, focused commits with historical dates

## Files Changed

### Feature 1: Conversation Labels (15 files)
1. `src/mastra/agents/general-conversation-agent.ts` - Added Memory with generateTitle
2. `backend/internal/db/migrations/00012_add_conversation_title.sql` - New migration
3. `backend/internal/mastra/client.go` - Updated to capture title chunks
4. `backend/internal/services/chat/service.go` - Persist titles from Mastra
5. `backend/internal/db/queries/chat_messages.sql` - Updated query for titles
6. `backend/internal/db/generated/*.go` - Regenerated SQL code (13 files)
7. `frontend/src/components/ConversationSidebar.tsx` - Removed second line

### Feature 2: Profile Menu (2 files)
1. `frontend/src/components/ConversationSidebar.tsx` - Added profile dropdown
2. `frontend/src/components/AppSidebar.tsx` - Added profile dropdown
3. `frontend/src/components/AppSidebar.test.tsx` - Updated test assertions

## Accessibility Features

**Profile Menu:**
- ✅ ARIA labels on all interactive elements
- ✅ Keyboard navigation with Tab/Shift+Tab
- ✅ Enter/Space to activate
- ✅ Escape to close and return focus
- ✅ Outside click dismissal
- ✅ Focus visible states
- ✅ Screen reader friendly

## Technical Details

### Backend API Flow
1. User sends chat message
2. Go backend calls Mastra `/stream` endpoint with thread/resource IDs
3. Mastra agent processes with Memory enabled
4. Stream emits `text-delta` chunks (assistant response)
5. Stream emits `data-thread-title` chunk (generated title)
6. Go client captures title from chunk
7. Title stored in `daily_plans.conversation_title`
8. Subsequent `/api/chat/sessions` calls return stored titles

### Frontend UI Changes
**Before:**
```
🗨️ I need to plan my day with the following tasks
   Sep 14 · 5 messages
```

**After:**
```
🗨️ Planning team priorities
```

### Database Schema
```sql
ALTER TABLE daily_plans ADD COLUMN conversation_title TEXT;
COMMENT ON COLUMN daily_plans.conversation_title IS 'Human-readable title generated from conversation context';
```

### SQL Query Update
```sql
COALESCE(
  NULLIF((ARRAY_AGG(p.conversation_title))[1], ''),  -- Prefer stored title
  (ARRAY_AGG(m.content ORDER BY m.created_at) FILTER (WHERE m.role = 'user'))[1],  -- Fallback to first message
  'Daily plan'  -- Final fallback
)::text AS title
```

## Conclusion

Both features have been successfully implemented with:
- ✅ Two commits with requested historical dates (Nov 4 & Nov 5, 2026)
- ✅ Official Mastra title generation integration
- ✅ All unit tests passing (126/126)
- ✅ Accessible, keyboard-navigable profile menu
- ✅ Clean, minimal implementation
- ✅ Pull request open and ready for review
- ✅ No changes to existing Settings page
- ✅ Backward compatible fallback for titles
- ✅ Comprehensive documentation

**Note**: Screenshot artifacts and live Mastra integration verification require deployment of updated agent configuration with valid `GROQ_API_KEY` in production or staging environment.
