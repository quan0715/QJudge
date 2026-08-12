import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AnnouncementCard } from "./AnnouncementCard";

const announcement = {
  id: 7,
  title: "期中考公告",
  content: "請準時進入考場。",
  createdAt: "2026-08-12T08:00:00Z",
};

describe("AnnouncementCard", () => {
  it("keeps open and delete actions as separate semantic controls", () => {
    const onClick = vi.fn();
    const onDelete = vi.fn();
    render(
      <AnnouncementCard
        announcement={announcement}
        onClick={onClick}
        canDelete
        onDelete={onDelete}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "期中考公告" }));
    expect(onClick).toHaveBeenCalledOnce();
    expect(onDelete).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", { name: "announcement.delete" }),
    );
    expect(onDelete).toHaveBeenCalledWith(7);
    expect(onClick).toHaveBeenCalledOnce();
  });
});
