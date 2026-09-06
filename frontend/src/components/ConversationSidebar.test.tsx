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

    const search = screen.getByRole("textbox");
    fireEvent.change(search, { target: { value: "planning" } });

    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(search.closest("[inert]")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Expand sidebar" }));

    expect(screen.getByRole("textbox")).toBe(search);
    expect(search).toHaveValue("planning");
    expect(search.closest("[inert]")).toBeNull();
  });
});
