import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CreateContestModal from "./CreateContestModal";

const mocks = vi.hoisted(() => ({ createClassroomContest: vi.fn() }));

vi.mock("@/infrastructure/api/repositories/classroom.repository", () => ({
  createClassroomContest: mocks.createClassroomContest,
}));

const renderModal = () => {
  const onCreated = vi.fn();
  render(
    <CreateContestModal open onClose={vi.fn()} onCreated={onCreated} classroomId="room-1" />,
  );
  return { onCreated };
};

const goToBasicStep = (type: "coding" | "exam", name: string) => {
  fireEvent.click(screen.getByTestId(`create-contest-type-${type}`));
  fireEvent.click(screen.getByRole("button", { name: "下一步" }));
  fireEvent.change(screen.getByTestId("create-contest-name"), { target: { value: name } });
};

describe("CreateContestModal", () => {
  beforeEach(() => {
    mocks.createClassroomContest.mockReset();
    mocks.createClassroomContest.mockResolvedValue({ contestId: "contest-9" });
  });

  it("creates a contest in two steps with strict mode off by default", async () => {
    const { onCreated } = renderModal();

    goToBasicStep("exam", "Week 1 練習");
    expect(screen.getByRole("switch")).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "button.create" }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("contest-9"));
    expect(mocks.createClassroomContest).toHaveBeenCalledWith("room-1", {
      name: "Week 1 練習",
      description: "",
      contest_type: "paper_exam",
      cheat_detection_enabled: false,
      results_published: false,
    });
  });

  it("sends strict mode when the teacher turns it on", async () => {
    renderModal();

    goToBasicStep("coding", "期中考");
    fireEvent.click(screen.getByRole("switch"));
    fireEvent.click(screen.getByRole("button", { name: "button.create" }));

    await waitFor(() =>
      expect(mocks.createClassroomContest).toHaveBeenCalledWith(
        "room-1",
        expect.objectContaining({ contest_type: "coding", cheat_detection_enabled: true }),
      ),
    );
  });

  it("leaves rejoin and QR attendance to the settings dialog", () => {
    renderModal();

    goToBasicStep("coding", "練習");

    expect(screen.getAllByRole("switch")).toHaveLength(1);
    expect(screen.queryByText("允許重新加入")).not.toBeInTheDocument();
    expect(screen.queryByText("QR 簽到簽退")).not.toBeInTheDocument();
  });
});
