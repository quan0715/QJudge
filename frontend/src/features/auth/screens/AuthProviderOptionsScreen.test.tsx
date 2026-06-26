import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AuthLayout from "@/features/auth/components/layout/AuthLayout";
import CampusSsoScreen from "./CampusSsoScreen";
import LoginScreen from "./LoginScreen";
import RegisterScreen from "./RegisterScreen";

const mockGetAuthOptions = vi.fn();
const mockGetOAuthUrl = vi.fn();
const mockLogin = vi.fn();
const mockRegister = vi.fn();

vi.mock("@/infrastructure/api/repositories/auth.repository", () => ({
  getAuthOptions: (...args: any[]) => mockGetAuthOptions(...args),
  getOAuthUrl: (...args: any[]) => mockGetOAuthUrl(...args),
  login: (...args: any[]) => mockLogin(...args),
  register: (...args: any[]) => mockRegister(...args),
}));

vi.mock("@/shared/ui/theme/ThemeContext", () => ({
  useTheme: vi.fn(() => ({
    theme: "white",
    preference: "light",
    setPreference: vi.fn(),
  })),
}));

vi.mock("@/shared/contexts/ContentLanguageContext", () => ({
  useContentLanguage: vi.fn(() => ({
    contentLanguage: "zh-TW",
    setContentLanguage: vi.fn(),
  })),
}));

const authOptions = {
  success: true,
  data: {
    email_password_enabled: false,
    providers: [
      {
        key: "school-x",
        type: "oidc",
        category: "campus",
        display_name: "Test University",
        display_name_i18n_key: "auth.providers.schoolX",
        logo_url: "/auth-providers/test.svg",
      },
      {
        key: "github",
        type: "oauth2",
        category: "social",
        display_name: "GitHub",
        display_name_i18n_key: "auth.providers.github",
      },
      {
        key: "google",
        type: "oidc",
        category: "social",
        display_name: "Google",
        display_name_i18n_key: "auth.providers.google",
      },
    ],
  },
};

function renderWithRouter(node: ReactNode) {
  return render(<MemoryRouter>{node}</MemoryRouter>);
}

function renderLoginWithLayout() {
  return render(
    <MemoryRouter initialEntries={["/login"]}>
      <Routes>
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<LoginScreen />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

function renderCampusSsoRoute(initialPath: "/login/campus-sso" | "/register/campus-sso") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path="/login/campus-sso"
          element={
            <>
              <CampusSsoScreen />
              <CurrentPath />
            </>
          }
        />
        <Route
          path="/register/campus-sso"
          element={
            <>
              <CampusSsoScreen />
              <CurrentPath />
            </>
          }
        />
        <Route path="/login" element={<CurrentPath />} />
        <Route path="/register" element={<CurrentPath />} />
      </Routes>
    </MemoryRouter>,
  );
}

const CurrentPath = () => {
  const location = useLocation();
  return <div data-testid="current-path">{location.pathname}</div>;
};

describe("auth provider options", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthOptions.mockResolvedValue(authOptions);
    mockGetOAuthUrl.mockResolvedValue("#campus-sso");
  });

  it("hides email/password login when disabled and renders dynamic social providers", async () => {
    const { container } = renderWithRouter(<LoginScreen />);

    expect(await screen.findByText("GitHub")).toBeInTheDocument();
    expect(screen.getByText("Google")).toBeInTheDocument();
    expect(screen.getByText("學校認證")).toBeInTheDocument();
    expect(screen.queryByText("使用 GitHub 登入")).not.toBeInTheDocument();
    expect(screen.queryByTestId("auth-login-email")).not.toBeInTheDocument();
    expect(
      Array.from(
        container.querySelectorAll(".auth-oauth-group--primary .auth-oauth-btn__label"),
      ).map((node) => node.textContent),
    ).toEqual(["GitHub", "Google", "學校認證"]);
    expect(container.querySelector(".auth-oauth-btn__arrow")).not.toBeInTheDocument();
  });

  it("renders the login page inside the visual split shell", async () => {
    renderLoginWithLayout();

    expect(await screen.findByText("GitHub")).toBeInTheDocument();
    expect(screen.getByTestId("auth-visual-background")).toBeInTheDocument();
    expect(screen.getByTestId("auth-login-split-shell")).toBeInTheDocument();
    expect(screen.getByTestId("auth-login-visual-panel")).toBeInTheDocument();
    expect(screen.getByTestId("auth-login-card-shell")).toBeInTheDocument();
  });

  it("reserves the provider row while auth options are loading", () => {
    mockGetAuthOptions.mockReturnValue(new Promise(() => {}));

    renderWithRouter(<LoginScreen />);

    expect(screen.getByTestId("auth-provider-loading-row")).toBeInTheDocument();
    expect(screen.getAllByTestId("auth-provider-loading-slot")).toHaveLength(3);
  });

  it("uses neutral credential placeholders and mobile footer actions when email login is enabled", async () => {
    mockGetAuthOptions.mockResolvedValue({
      ...authOptions,
      data: {
        ...authOptions.data,
        email_password_enabled: true,
      },
    });

    renderWithRouter(<LoginScreen />);

    expect(await screen.findByLabelText("Email / Username")).toHaveAttribute(
      "placeholder",
      "信箱或使用者名稱",
    );
    expect(screen.getByTestId("auth-login-password")).toHaveAttribute("placeholder", "密碼");
    expect(screen.getByTestId("auth-login-mobile-register")).toHaveTextContent("建立帳號");
    expect(screen.getByTestId("auth-login-mobile-submit")).toHaveTextContent("登入");
  });

  it("renders SSO registration providers when email/password registration is disabled", async () => {
    renderWithRouter(<RegisterScreen />);

    expect(await screen.findByText("學校認證")).toBeInTheDocument();
    expect(screen.queryByTestId("auth-register-email")).not.toBeInTheDocument();
  });

  it("uses a generic campus selector on registration before email registration", async () => {
    mockGetAuthOptions.mockResolvedValue({
      ...authOptions,
      data: {
        ...authOptions.data,
        email_password_enabled: true,
      },
    });

    const { container } = renderWithRouter(
      <>
        <RegisterScreen />
        <CurrentPath />
      </>,
    );

    expect(await screen.findByText("GitHub")).toBeInTheDocument();
    expect(screen.getByText("Google")).toBeInTheDocument();
    expect(screen.getByText("學校認證")).toBeInTheDocument();
    expect(screen.queryByText("Test University")).not.toBeInTheDocument();
    expect(
      Array.from(
        container.querySelectorAll(".auth-oauth-group--primary .auth-oauth-btn__label"),
      ).map((node) => node.textContent),
    ).toEqual(["GitHub", "Google", "學校認證"]);

    const providerGroup = container.querySelector(".auth-oauth-group--primary");
    const emailForm = screen.getByTestId("auth-register-form");
    expect(providerGroup).not.toBeNull();
    expect(providerGroup!.compareDocumentPosition(emailForm) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "學校認證" }));
    expect(screen.getByTestId("current-path")).toHaveTextContent("/register/campus-sso");
  });

  it("renders only campus providers on the campus SSO screen", async () => {
    renderCampusSsoRoute("/login/campus-sso");

    expect(await screen.findByText("Test University")).toBeInTheDocument();
    expect(screen.queryByText("GitHub")).not.toBeInTheDocument();
    expect(screen.getByTestId("auth-campus-sso-back")).toHaveTextContent("返回登入");
    expect(screen.getByTestId("auth-campus-sso-submit")).toBeDisabled();
    expect(screen.getByTestId("auth-campus-sso-mobile-submit")).toBeDisabled();
  });

  it("requires selecting a campus provider before verification", async () => {
    renderCampusSsoRoute("/login/campus-sso");

    const provider = await screen.findByRole("button", { name: /Test University/ });
    const submit = screen.getByTestId("auth-campus-sso-submit");

    expect(submit).toBeDisabled();

    fireEvent.click(provider);
    expect(provider).toHaveAttribute("aria-pressed", "true");
    expect(submit).toBeEnabled();

    fireEvent.click(submit);
    await waitFor(() => expect(mockGetOAuthUrl).toHaveBeenCalledWith("school-x"));
  });

  it("returns to the originating registration screen from campus SSO", async () => {
    renderCampusSsoRoute("/register/campus-sso");

    expect(await screen.findByText("Test University")).toBeInTheDocument();
    expect(screen.getByTestId("auth-campus-sso-back")).toHaveTextContent("返回建立帳號");

    fireEvent.click(screen.getByTestId("auth-campus-sso-back"));
    expect(screen.getByTestId("current-path")).toHaveTextContent("/register");
  });

  it("shows the same campus providers on registration SSO", async () => {
    mockGetAuthOptions.mockResolvedValue({
      ...authOptions,
      data: {
        ...authOptions.data,
        providers: [
          ...authOptions.data.providers,
          {
            key: "school-y",
            type: "oidc",
            category: "campus",
            display_name: "Second University",
            display_name_i18n_key: "auth.providers.school-y",
            logo_url: "",
          },
        ],
      },
    });

    render(
      <MemoryRouter initialEntries={["/register/campus-sso"]}>
        <CampusSsoScreen />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Test University")).toBeInTheDocument();
    expect(screen.getByText("Second University")).toBeInTheDocument();
  });
});
