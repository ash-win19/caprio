import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConversationSidebar } from "./ConversationSidebar";
import { useSidebarStore } from "@/lib/sidebar";

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

const mount = () =>
  render(
    <MemoryRouter>
      <ConversationSidebar
        sessions={[]}
        selectedDate="2026-08-30"
        isLoading={false}
        onSelect={vi.fn()}
        onToday={vi.fn()}
      />
      <textarea aria-label="Message about your day" />
    </MemoryRouter>,
  );

beforeEach(() => {
  useSidebarStore.setState({ collapsed: false });
});

describe("ConversationSidebar", () => {
  it("collapses to a compact rail and expands again, handing focus to the visible toggle", () => {
    mount();

    const search = screen.getByRole("textbox", { name: "Search conversations" });
    fireEvent.change(search, { target: { value: "planning" } });

    const collapse = screen.getByRole("button", { name: "Collapse sidebar" });
    collapse.focus();
    fireEvent.click(collapse);

    expect(screen.queryByRole("textbox", { name: "Search conversations" })).not.toBeInTheDocument();
    expect(search.closest("[inert]")).not.toBeNull();
    const expand = screen.getByRole("button", { name: "Expand sidebar" });
    expect(expand).toHaveFocus();
    fireEvent.click(expand);

    expect(screen.getByRole("textbox", { name: "Search conversations" })).toBe(search);
    expect(search).toHaveValue("planning");
    expect(search.closest("[inert]")).toBeNull();
    expect(screen.getByRole("button", { name: "Collapse sidebar" })).toHaveFocus();
  });

  it("keeps focus in the message box when the shortcut toggles it, but rescues focus from inside the panel", () => {
    mount();
    const message = screen.getByRole("textbox", { name: "Message about your day" });
    message.focus();

    fireEvent.keyDown(window, { key: "b", metaKey: true });
    expect(useSidebarStore.getState().collapsed).toBe(true);
    expect(message).toHaveFocus();
    fireEvent.keyDown(window, { key: "b", metaKey: true });
    expect(useSidebarStore.getState().collapsed).toBe(false);

    screen.getByRole("textbox", { name: "Search conversations" }).focus();
    fireEvent.keyDown(window, { key: "b", ctrlKey: true });
    expect(screen.getByRole("button", { name: "Expand sidebar" })).toHaveFocus();
  });
});
