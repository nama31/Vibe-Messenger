"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

/**
 * Generic error boundary.
 * Catches render errors in the subtree and shows a palette-styled fallback.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }

  override render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div
          className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center"
          style={{ backgroundColor: "var(--bg-page)" }}
        >
          {/* Warning icon */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--text-secondary)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>

          <div className="flex flex-col gap-1">
            <p
              className="text-sm font-medium"
              style={{ color: "var(--text-primary)" }}
            >
              Something went wrong
            </p>
            <p
              className="text-xs max-w-xs"
              style={{ color: "var(--text-secondary)" }}
            >
              {this.state.message}
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              this.setState({ hasError: false, message: "" });
              window.location.reload();
            }}
            className="text-sm px-4 py-2 rounded-lg transition-opacity hover:opacity-80"
            style={{
              backgroundColor: "var(--text-primary)",
              color: "var(--bg-page)",
            }}
          >
            Reload
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
