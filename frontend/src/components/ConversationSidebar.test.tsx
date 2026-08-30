import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { ConversationSidebar } from "./ConversationSidebar";

vi.mock("@/lib/store", () => ({
  useAppStore: vi.fn((selector) =>
    selector({
      user: {
        name: "Ashwin Shanmugam",
        email: "ashwin@example.com",
        categories: [],
      },
    }),
  ),
}));

describe("ConversationSidebar", () => {
  it("collapses to a compact rail and expands again", () => {
    render(
      <MemoryRouter>
        <ConversationSidebar
          sessions={[]}
          selectedDate="2026-08-30"
          isLoading={false}
          onSelect={vi.fn()}
          onToday={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByPlaceholderText("Search conversations")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));

    expect(screen.queryByPlaceholderText("Search conversations")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Expand sidebar" }));

    expect(screen.getByPlaceholderText("Search conversations")).toBeInTheDocument();
  });
});
