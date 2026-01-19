import { useNavigate, useLocation } from "react-router-dom";
import { useTheme } from "@/shared/ui/theme/ThemeContext";
import { ServerError } from "../components/ServerError";

interface ServerErrorState {
  statusCode?: number;
  message?: string;
  timestamp?: string;
}

/**
 * 500 Server Error Screen
 * Displayed when server is unavailable or returns 5xx errors
 */
const ServerErrorScreen = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme } = useTheme();

  // Get error details from navigation state
  const state = location.state as ServerErrorState | null;
  const statusCode = state?.statusCode || 500;

  return (
    <ServerError
      theme={theme}
      statusCode={statusCode}
      message={state?.message}
      timestamp={state?.timestamp}
      onRetry={() => window.location.reload()}
      onHome={() => navigate("/dashboard", { replace: true })}
    />
  );
};

export default ServerErrorScreen;
