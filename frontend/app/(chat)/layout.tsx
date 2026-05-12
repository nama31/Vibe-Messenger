"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "../../store/authStore";
import { ThemeToggle } from "../../components/common/ThemeToggle";
import { ConversationList } from "../../components/sidebar/ConversationList";
import { UserSearch } from "../../components/sidebar/UserSearch";
import { NewConversationModal } from "../../components/sidebar/NewConversationModal";

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const access_token = useAuthStore((s) => s.access_token);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const [modalOpen, setModalOpen] = useState(false);
  // Mobile: sidebar open state. Default open on desktop, closed on mobile.
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Auth guard
  useEffect(() => {
    if (!access_token) router.replace("/login");
  }, [access_token, router]);

  // On mobile, close sidebar when navigating to a conversation
  useEffect(() => {
    if (pathname.startsWith("/conversations/")) {
      setSidebarOpen(false);
    }
  }, [pathname]);

  if (!access_token) return null;

  // On mobile, show sidebar overlay when open; on md+ always show sidebar
  const isConversationOpen = pathname.startsWith("/conversations/");

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: "var(--bg-page)" }}>

      {/* ── Mobile overlay backdrop ──────────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 md:hidden"
          style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Sidebar ─────────────────────────────────────────────────── */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-30 flex flex-col w-72 shrink-0
          transition-transform duration-300 ease-in-out
          md:relative md:translate-x-0 md:z-auto
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        `}
        style={{
          backgroundColor: "var(--bg-sidebar)",
          borderRight: "1px solid var(--border)",
        }}
        aria-label="Sidebar"
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 shrink-0"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <span
            className="text-lg font-semibold tracking-tight"
            style={{ color: "var(--text-primary)" }}
          >
            Vibe
          </span>

          <div className="flex items-center gap-1">
            {/* New conversation */}
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              aria-label="New conversation"
              className="w-8 h-8 flex items-center justify-center rounded-full
                         transition-colors duration-150"
              style={{ color: "var(--text-secondary)" }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "rgba(0,0,0,0.06)")
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent")
              }
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
            <ThemeToggle />
          </div>
        </div>

        {/* User search */}
        <div
          className="px-3 py-2 shrink-0"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <UserSearch onSelectUser={() => setSidebarOpen(false)} />
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          <ConversationList />
        </div>

        {/* Footer */}
        <div
          className="flex items-center gap-3 px-4 py-3 shrink-0"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <button
            type="button"
            onClick={() => { setSidebarOpen(false); router.push("/settings"); }}
            className="flex items-center gap-3 flex-1 min-w-0 text-left rounded-lg
                       transition-colors duration-150"
            aria-label="Open profile settings"
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center
                         shrink-0 text-xs font-semibold select-none overflow-hidden"
              style={{ backgroundColor: "var(--text-secondary)", color: "var(--bg-page)" }}
            >
              {user?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.avatar_url}
                  alt={user.display_name}
                  className="w-full h-full object-cover"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                />
              ) : (
                user?.display_name?.charAt(0).toUpperCase() ?? "?"
              )}
            </div>
            <span
              className="flex-1 text-sm font-medium truncate"
              style={{ color: "var(--text-primary)" }}
            >
              {user?.display_name ?? user?.username ?? ""}
            </span>
          </button>

          <button
            type="button"
            onClick={() => { logout(); router.replace("/login"); }}
            aria-label="Log out"
            className="shrink-0 transition-colors duration-150"
            style={{ color: "var(--text-secondary)" }}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLButtonElement).style.color = "var(--text-primary)")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLButtonElement).style.color = "var(--text-secondary)")
            }
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      </aside>

      {/* ── Main panel ──────────────────────────────────────────────── */}
      <main className="flex-1 overflow-hidden flex flex-col min-w-0">
        {/* Mobile top bar — shown only when a conversation is open */}
        <div
          className="flex items-center gap-2 px-3 py-2 shrink-0 md:hidden"
          style={{ borderBottom: "1px solid var(--border)", backgroundColor: "var(--bg-sidebar)" }}
        >
          {isConversationOpen ? (
            /* Back arrow — returns to sidebar */
            <button
              type="button"
              onClick={() => { router.push("/"); setSidebarOpen(false); }}
              aria-label="Back to conversations"
              className="flex items-center gap-2 text-sm font-medium"
              style={{ color: "var(--text-primary)" }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Back
            </button>
          ) : (
            /* Hamburger — opens sidebar */
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open sidebar"
              style={{ color: "var(--text-primary)" }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
          )}

          <span
            className="text-base font-semibold tracking-tight"
            style={{ color: "var(--text-primary)" }}
          >
            Vibe
          </span>
        </div>

        {/* Page content */}
        <div className="flex-1 overflow-hidden">
          {children}
        </div>
      </main>

      {/* ── New conversation modal ───────────────────────────────────── */}
      <NewConversationModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
