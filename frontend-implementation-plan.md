# Frontend Implementation Plan: Phase by Phase

**Color palette (all phases use these — never deviate):**

| Name | Hex | Role |
|---|---|---|
| Floral White | `#FFFBF4` | Page background (light mode) |
| Bone | `#D8CFBC` | Sidebar background, input fields, borders |
| Olive Drab | `#565449` | Secondary text, icons, subtle UI elements |
| Smoky Black | `#11120D` | Primary text, own message bubbles, buttons |

**Dark mode mapping:**

| Light | Dark |
|---|---|
| `#FFFBF4` (page bg) | `#11120D` (page bg) |
| `#D8CFBC` (sidebar) | `#1C1B17` (sidebar) |
| `#565449` (secondary) | `#D8CFBC` (secondary) |
| `#11120D` (text) | `#FFFBF4` (text) |

**Strategy:** Never ask the AI to "build the chat UI." Ask it to "implement this one component using these exact props and this exact color palette." Always paste the component stub, the relevant types from `src/types/index.ts`, and the color table above into every prompt.

---

## Phase 1: Design Foundation (globals, tokens, layout shell)

**Goal:** Every page has the correct background, font, and color tokens. Dark mode works. The app shell (sidebar + main panel split) renders correctly.

### Tasks

**1.1 — Update `app/globals.css`**

Replace the default Next.js CSS variables with the palette tokens and Tailwind v4 theme registration:

```css
@import "tailwindcss";

:root {
  --bg-page:    #FFFBF4;   /* Floral White */
  --bg-sidebar: #D8CFBC;   /* Bone */
  --text-primary:   #11120D;   /* Smoky Black */
  --text-secondary: #565449;   /* Olive Drab */
  --border:     #D8CFBC;
  --bubble-own: #11120D;
  --bubble-other: #D8CFBC;
}

.dark {
  --bg-page:    #11120D;
  --bg-sidebar: #1C1B17;
  --text-primary:   #FFFBF4;
  --text-secondary: #D8CFBC;
  --border:     #2A2924;
  --bubble-own: #565449;
  --bubble-other: #1C1B17;
}

@theme inline {
  --color-page:      var(--bg-page);
  --color-sidebar:   var(--bg-sidebar);
  --color-primary:   var(--text-primary);
  --color-secondary: var(--text-secondary);
  --color-border:    var(--border);
  --color-bubble-own:   var(--bubble-own);
  --color-bubble-other: var(--bubble-other);
}

body {
  background-color: var(--bg-page);
  color: var(--text-primary);
}
```

**1.2 — Update `app/layout.tsx`**

- Wrap `<body>` with `<ThemeProvider attribute="class" defaultTheme="light">` from `next-themes`
- Add `suppressHydrationWarning` to `<html>`
- Update `<Metadata>` title to `"Vibe Messenger"`

**1.3 — Implement `<ThemeToggle>` (`src/components/common/ThemeToggle.tsx`)**

- Use `useTheme()` from `next-themes`
- Render a sun icon (light) / moon icon (dark) — use inline SVG, no icon library needed
- Style: `bg-[var(--bg-sidebar)] text-[var(--text-secondary)] rounded-full p-2`

**1.4 — Implement `(chat)/layout.tsx` shell**

- `<aside>` — `w-72 bg-[var(--bg-sidebar)] border-r border-[var(--border)] flex flex-col`
- `<main>` — `flex-1 bg-[var(--bg-page)] overflow-hidden`
- Auth guard: client component that reads `useAuthStore`, redirects to `/login` if `access_token` is null
- Place `<ThemeToggle>` at the bottom of the sidebar

**How to test:** Run `npm run dev`. Navigate to `/`. The page should be Floral White background with Smoky Black text. Toggle dark mode — background flips to Smoky Black, text to Floral White.

---

## Phase 2: Auth Pages (Login & Register)

**Goal:** Users can register and log in. JWT is stored in Zustand. Successful auth redirects to `/`.

### Tasks

**2.1 — Implement `(auth)/login/page.tsx`**

Full client component. Layout: centered card on `bg-[var(--bg-page)]`.

Card styles: `bg-[var(--bg-sidebar)] rounded-2xl p-8 w-full max-w-sm shadow-sm`

Fields:
- Email input: `bg-[var(--bg-page)] border border-[var(--border)] rounded-lg px-4 py-2 w-full text-[var(--text-primary)]`
- Password input: same styles + show/hide toggle
- Submit button: `bg-[var(--text-primary)] text-[var(--bg-page)] rounded-lg px-4 py-2 w-full font-medium hover:opacity-90`

Logic:
```
POST /auth/login  { email, password }
→ on success: useAuthStore.setAuth(user, access_token, refresh_token)
→ router.push("/")
→ on 401/404: show inline error message below the form
```

**2.2 — Implement `(auth)/register/page.tsx`**

Same card layout as login. Fields: username, email, password, display_name.

Logic:
```
POST /auth/register  { username, email, password, display_name }
→ on 201: useAuthStore.setAuth(...) → router.push("/")
→ on 409: show "Username or email already taken"
→ client-side: username must match ^[a-z0-9_]+$, min 3 chars
```

**2.3 — Add redirect in `(auth)` pages**

If `access_token` already exists in the store, redirect immediately to `/` (user is already logged in).

**AI Prompt template:**
> "Implement `app/(auth)/login/page.tsx` as a Next.js 14 client component. Use `apiFetch` from `@/lib/api` to call `POST /auth/login`. On success call `useAuthStore.setAuth()` and `router.push('/')`. On error show the message inline. Use these exact Tailwind classes for the card: [paste 1.1 card styles]. Use these exact color variables: [paste palette table]."

**How to test:** Register a new user. Verify the Zustand store has `access_token` set (check localStorage key `messenger-auth` in DevTools). Log out and log back in.

---

## Phase 3: Conversation Sidebar

**Goal:** The sidebar shows all conversations with last message, unread badge, and online dot. Clicking one navigates to `/conversations/:id`.

### Tasks

**3.1 — Implement `useConversations()` in `src/hooks/useQueries.ts`**

```typescript
export function useConversations() {
  const token = useAuthStore(s => s.access_token);
  return useQuery({
    queryKey: ["conversations"],
    queryFn: () => apiFetch<ConversationListResponse>("/conversations", { token }),
    enabled: !!token,
    refetchOnWindowFocus: true,
  });
}
```

Wrap the app in `<QueryClientProvider>` inside `app/layout.tsx`.

**3.2 — Implement `<PresenceDot>` (`src/components/common/PresenceDot.tsx`)**

```
is_online=true  → w-2.5 h-2.5 rounded-full bg-green-500 ring-2 ring-[var(--bg-sidebar)]
is_online=false → same but bg-[var(--text-secondary)]
```

**3.3 — Implement `<ConversationItem>` (`src/components/sidebar/ConversationItem.tsx`)**

Props: `conversation: Conversation`, `isActive: boolean`, `currentUserId: string`

Layout (single row, `h-16`):
```
[Avatar/initials] [Name + last message snippet]  [time + unread badge]
```

- Avatar: 40×40 circle, `bg-[var(--text-secondary)] text-[var(--bg-page)]`, initials from `display_name`
- For DMs: derive display name from the other participant (not `currentUserId`)
- Last message: truncate to 1 line, `text-[var(--text-secondary)] text-sm`
- Unread badge: `bg-[var(--text-primary)] text-[var(--bg-page)] text-xs rounded-full px-1.5` — hidden when 0
- Active state: `bg-[var(--bg-page)]` background; inactive: transparent with `hover:bg-[var(--bg-page)]/50`
- `<PresenceDot>` overlaid on avatar bottom-right

**3.4 — Implement `<ConversationList>` (`src/components/sidebar/ConversationList.tsx`)**

- Call `useConversations()`
- Loading state: 3 skeleton rows (animated `bg-[var(--border)] rounded animate-pulse`)
- Empty state: "No conversations yet" centered in Olive Drab text
- Map over `conversations` → `<ConversationItem>`
- `<Link href={/conversations/${id}}>` wraps each item

**3.5 — Wire sidebar into `(chat)/layout.tsx`**

Replace the `{/* TODO */}` with:
- Top: app name "Vibe" in `text-[var(--text-primary)] font-semibold text-lg` + `<ThemeToggle>`
- Middle: `<UserSearch />` (stub for now — Phase 4)
- Scrollable area: `<ConversationList />`
- Bottom: current user display name + logout button

**How to test:** Log in, check the sidebar renders your conversations. Unread badge shows correct count. Clicking a conversation changes the URL.

---

## Phase 4: User Search & New Conversation Modal

**Goal:** Users can search for other users and start a DM or group chat from the sidebar.

### Tasks

**4.1 — Implement `useUsers(q)` in `src/hooks/useQueries.ts`**

```typescript
export function useUsers(q: string) {
  const token = useAuthStore(s => s.access_token);
  return useQuery({
    queryKey: ["users", q],
    queryFn: () => apiFetch<UserSearchResponse>(`/users?q=${encodeURIComponent(q)}`, { token }),
    enabled: !!token && q.length >= 2,
    staleTime: 30_000,
  });
}
```

**4.2 — Implement `<UserSearch>` (`src/components/sidebar/UserSearch.tsx`)**

- Text input: `bg-[var(--bg-page)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm w-full`
- Debounce input by 300ms before updating query key
- Results dropdown: `absolute bg-[var(--bg-sidebar)] border border-[var(--border)] rounded-xl shadow-lg z-10 w-full`
- Each result row: avatar initials + display_name + username + `<PresenceDot>` + "Chat" button
- Clicking "Chat": calls `POST /conversations { is_group: false, participant_ids: [user.id] }` → on success `router.push(/conversations/${id})`
- Close dropdown on outside click (`useRef` + `useEffect` with `mousedown` listener)

**4.3 — Implement `<NewConversationModal>` (`src/components/sidebar/NewConversationModal.tsx`)**

Triggered by a "+" button in the sidebar header.

Modal overlay: `fixed inset-0 bg-black/40 flex items-center justify-center z-50`
Card: `bg-[var(--bg-sidebar)] rounded-2xl p-6 w-full max-w-md`

Two tabs: "Direct Message" | "Group Chat"

DM tab: same user search as above, click to create and navigate.

Group tab:
- Group name input
- Multi-select user search (add/remove chips)
- Chip style: `bg-[var(--bg-page)] text-[var(--text-primary)] rounded-full px-3 py-1 text-sm flex items-center gap-1`
- "Create Group" button → `POST /conversations { is_group: true, name, participant_ids }`

**How to test:** Search for a registered user. Click "Chat" — verify a DM conversation is created and you're redirected to it. Create a group with 2 other users.

---

## Phase 5: Chat Window

**Goal:** The main panel shows message history and lets users send messages in real time.

### Tasks

**5.1 — Implement `useMessages(conversationId)` in `src/hooks/useQueries.ts`**

```typescript
export function useMessages(conversationId: string) {
  const token = useAuthStore(s => s.access_token);
  return useInfiniteQuery({
    queryKey: ["messages", conversationId],
    queryFn: ({ pageParam }) =>
      apiFetch<MessageHistoryResponse>(
        `/conversations/${conversationId}/messages${pageParam ? `?before=${pageParam}` : ""}`,
        { token }
      ),
    getNextPageParam: (last) =>
      last.has_more ? last.messages.at(-1)?.id : undefined,
    initialPageParam: undefined,
    enabled: !!token && !!conversationId,
  });
}
```

**5.2 — Implement `<MessageBubble>` (`src/components/chat/MessageBubble.tsx`)**

Props: `message: Message`, `isOwn: boolean`

Own messages (right-aligned):
```
justify-end
bubble: bg-[var(--bubble-own)] text-[var(--bg-page)] rounded-2xl rounded-br-sm px-4 py-2 max-w-[70%]
```

Other messages (left-aligned):
```
justify-start
[avatar 32px] bubble: bg-[var(--bubble-other)] text-[var(--text-primary)] rounded-2xl rounded-bl-sm px-4 py-2 max-w-[70%]
```

- Deleted: italic `text-[var(--text-secondary)]` "[deleted]", no edit/delete menu
- Edited: small `· edited` suffix in `text-[var(--text-secondary)] text-xs`
- Emoji type: render at `text-4xl`, no bubble background
- Timestamp: `text-xs text-[var(--text-secondary)]` below bubble, formatted as `HH:mm`
- Own messages: show edit (pencil) and delete (trash) icon buttons on hover — call `PATCH /messages/:id` and `DELETE /messages/:id`

**5.3 — Implement `<TypingIndicator>` (`src/components/chat/TypingIndicator.tsx`)**

Props: `typingUsers: Record<string, boolean>`, `participants: User[]`

- Only render when at least one `typingUsers[id] === true`
- Show "Name is typing..." or "Name and X others are typing..."
- Three animated dots: `animate-bounce` with staggered `animation-delay`
- Style: same as other-message bubble but smaller, `text-[var(--text-secondary)] text-sm`

**5.4 — Implement `<MessageList>` (`src/components/chat/MessageList.tsx`)**

Props: `messages: Message[]`, `currentUserId: string`, `participants: User[]`, `hasMore: boolean`, `onLoadMore: () => void`

- Scroll container: `flex flex-col-reverse overflow-y-auto` (newest at bottom, scroll up for history)
- "Load older messages" button at top — only shown when `hasMore`, calls `onLoadMore`
- Auto-scroll to bottom on new message append (use `useEffect` + `scrollIntoView` on a bottom anchor ref)
- Group consecutive messages from the same sender — hide avatar/name for follow-up bubbles within 2 minutes

**5.5 — Implement `<MessageInput>` (`src/components/chat/MessageInput.tsx`)**

Props: `onSend: (content: string) => void`, `onTyping: (is_typing: boolean) => void`

- `<textarea>` auto-resizes (1–5 rows): `bg-[var(--bg-sidebar)] border border-[var(--border)] rounded-xl px-4 py-3 resize-none w-full text-[var(--text-primary)]`
- Send button: `bg-[var(--text-primary)] text-[var(--bg-page)] rounded-xl px-4 py-3` — disabled when empty
- Enter sends (Shift+Enter = newline)
- Typing events: fire `onTyping(true)` on keydown, debounce `onTyping(false)` after 2.5s of no input

**5.6 — Implement `<ChatWindow>` (`src/components/chat/ChatWindow.tsx`)**

Compose all the above:
```
<div className="flex flex-col h-full">
  <header>  ← conversation name, participant count, presence dots  </header>
  <MessageList />   ← flex-1 overflow-y-auto
  <TypingIndicator />
  <MessageInput />
</div>
```

- Load initial messages via `useMessages()` (REST, for history)
- Live messages via `useChat()` (WebSocket, for real-time)
- Merge: seed `useChat` state with REST history on mount via `dispatch({ type: "SET_MESSAGES", messages })`
- Call `markRead()` on mount and when new messages arrive

**5.7 — Implement `(chat)/conversations/[id]/page.tsx`**

```typescript
export default function ConversationPage({ params }: { params: { id: string } }) {
  return <ChatWindow conversationId={params.id} />;
}
```

**How to test:** Open two browser tabs logged in as different users. Send a message in one tab — it should appear instantly in the other. Type in one tab — the other shows the typing indicator. Close one tab — the presence dot goes grey.

---

## Phase 6: Settings Page & Profile Update

**Goal:** Users can update their display name and avatar URL.

### Tasks

**6.1 — Implement `app/settings/page.tsx`**

Layout: centered card, same style as auth pages.

Fields:
- Display name input (pre-filled from `useAuthStore().user.display_name`)
- Avatar URL input (pre-filled, or empty)
- Avatar preview: 80×80 circle — if URL is valid show `<img>`, else show initials

Logic:
```
PATCH /users/me  { display_name?, avatar_url? }
→ on 200: update Zustand store user object
→ show "Saved" confirmation for 2 seconds
```

**6.2 — Link to settings from sidebar**

Bottom of sidebar: clicking the current user's name/avatar navigates to `/settings`.

**How to test:** Change display name. Refresh — new name appears in sidebar and chat bubbles.

---

## Phase 7: Polish & Responsive Layout

**Goal:** The app works on mobile. Edge cases are handled gracefully.

### Tasks

**7.1 — Mobile sidebar collapse**

- Below `md` breakpoint: sidebar is hidden by default, shown via a hamburger button
- `<ChatWindow>` shows a back arrow that returns to the sidebar
- Use `useState` for `sidebarOpen` in `(chat)/layout.tsx`

**7.2 — Empty states**

- `/` (no conversation selected): centered illustration + "Select a conversation or start a new one" in `text-[var(--text-secondary)]`
- No search results: "No users found for '...'" 
- No messages yet: "No messages yet. Say hello!" centered in the chat window

**7.3 — Error boundaries**

- Wrap `<ChatWindow>` in an error boundary that shows "Something went wrong. Reload?" in the palette colors
- Network error on `apiFetch`: show a toast-style banner at the top — `bg-red-900/20 text-red-400 border border-red-900/30 rounded-lg px-4 py-2`

**7.4 — `(chat)/page.tsx` empty state**

```typescript
export default function ChatIndexPage() {
  return (
    <div className="flex h-full items-center justify-center text-[var(--text-secondary)]">
      Select a conversation to start chatting
    </div>
  );
}
```

**How to test:** Resize browser to 375px width. Verify sidebar collapses and the hamburger button appears. Navigate into a conversation and back.

---

## Prompt Template for Every Phase

When prompting an AI to implement a component, always include:

1. **The component stub** — exact file content with `// TODO` comments
2. **Relevant types** — paste the interfaces from `src/types/index.ts` the component uses
3. **The color palette table** — all 4 colors with their CSS variable names
4. **The API call** — paste the exact endpoint shape from the architecture doc
5. **The constraint** — "Do not install any new packages. Use only what is in `package.json`."

**Example prompt for Phase 5.2:**
> "Implement `<MessageBubble>` in `src/components/chat/MessageBubble.tsx`. Here is the stub: [paste]. Here are the types it uses: [paste Message, User]. Use these CSS variables for colors: `--bubble-own: #11120D`, `--bubble-other: #D8CFBC`, `--text-secondary: #565449`, `--bg-page: #FFFBF4`. Own messages right-aligned with white text, others left-aligned with dark text. Show edit/delete buttons on hover for own messages only. No new packages."

---

## Summary

| Phase | What gets built | Backend endpoints used |
|---|---|---|
| 1 | Design tokens, dark mode, app shell | — |
| 2 | Login + Register pages | `POST /auth/login`, `POST /auth/register` |
| 3 | Conversation sidebar | `GET /conversations` |
| 4 | User search + new conversation modal | `GET /users?q=`, `POST /conversations` |
| 5 | Chat window (REST history + WS real-time) | `GET /conversations/:id/messages`, `WS /ws/:id` |
| 6 | Settings / profile update | `PATCH /users/me` |
| 7 | Mobile layout + polish | — |
