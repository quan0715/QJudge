import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ForgotPasswordScreen from "./ForgotPasswordScreen";
import ResetPasswordScreen from "./ResetPasswordScreen";

const mocks = vi.hoisted(() => ({ request: vi.fn(), complete: vi.fn(), setUser: vi.fn(), options: { password_enabled: true, password_reset_enabled: true, providers: [] } }));
vi.mock("@/infrastructure/api/repositories/auth.repository", () => ({ requestPasswordReset: mocks.request, completePasswordReset: mocks.complete }));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ setUser: mocks.setUser }) }));
vi.mock("../contexts/AuthLayoutContext", () => ({ useAuthLayoutMetadata: vi.fn() }));
vi.mock("../hooks/useAuthOptions", () => ({ useAuthOptions: () => ({ options: mocks.options, loading: false, error: null }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
const token = "a".repeat(43);
const reset = (fragment = `#token=${token}`) => render(<MemoryRouter initialEntries={[`/reset-password${fragment}`]}><ResetPasswordScreen /></MemoryRouter>);
const fill = (password = "StrongPassword98!", confirm = password) => {
  fireEvent.change(screen.getByLabelText("auth.passwordReset.password"), { target: { value: password } });
  fireEvent.change(screen.getByLabelText("auth.passwordReset.confirmation"), { target: { value: confirm } });
  fireEvent.click(screen.getByRole("button", { name: "auth.passwordReset.reset" }));
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.options.password_reset_enabled = true;
  mocks.request.mockResolvedValue({ data: null, meta: {} });
  mocks.complete.mockResolvedValue({ data: null, meta: {} });
});

describe("password recovery", () => {
  it("submits an identifier and shows the generic delivery result", async () => {
    render(<MemoryRouter><ForgotPasswordScreen /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText("auth.passwordReset.identifier"), { target: { value: " person@example.test " } });
    fireEvent.click(screen.getByRole("button", { name: "auth.passwordReset.send" }));
    await screen.findByText("auth.passwordReset.genericMessage");
    expect(mocks.request).toHaveBeenCalledWith("person@example.test");
  });
  it("shows rate-limit or delivery-unavailable errors", async () => {
    mocks.request.mockRejectedValue(new Error("Try again later"));
    render(<MemoryRouter><ForgotPasswordScreen /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText("auth.passwordReset.identifier"), { target: { value: "person@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "auth.passwordReset.send" }));
    expect(await screen.findByText("Try again later")).toHaveAttribute("role", "alert");
  });
  it("hides the request form until deployment enables mail", () => {
    mocks.options.password_reset_enabled = false;
    render(<MemoryRouter><ForgotPasswordScreen /></MemoryRouter>);
    expect(screen.getByRole("status")).toHaveTextContent("auth.passwordReset.disabled");
    expect(screen.queryByRole("textbox")).toBeNull();
  });
  it("uses the fragment token, resets the password and clears local identity", async () => {
    reset(); fill();
    await screen.findByText("auth.passwordReset.completed");
    expect(mocks.complete).toHaveBeenCalledWith(token, "StrongPassword98!", "StrongPassword98!");
    expect(mocks.setUser).toHaveBeenCalledWith(null);
  });
  it("rejects mismatched confirmation before sending", async () => {
    reset(); fill("password-one", "password-two");
    expect(await screen.findByRole("alert")).toHaveTextContent("auth.passwordReset.mismatch");
    expect(mocks.complete).not.toHaveBeenCalled();
  });
  it("shows invalid or expired token errors from the API", async () => {
    mocks.complete.mockRejectedValue(new Error("Link expired"));
    reset(); fill();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Link expired"));
    expect(mocks.setUser).not.toHaveBeenCalled();
  });
  it("does not submit malformed or missing tokens", () => {
    reset("#token=bad");
    expect(screen.getByRole("alert")).toHaveTextContent("auth.passwordReset.invalidLink");
    expect(screen.queryByRole("button", { name: "auth.passwordReset.reset" })).toBeNull();
  });
});
