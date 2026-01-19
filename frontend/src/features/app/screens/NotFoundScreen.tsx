import { useNavigate } from "react-router-dom";
import { useTheme } from "@/shared/ui/theme/ThemeContext";
import { NotFound } from "../components/NotFound";

/**
 * 404 Not Found Screen
 * Displayed when user navigates to a non-existent route
 */
const NotFoundScreen = () => {
  const navigate = useNavigate();
  const { theme } = useTheme();

  const handleGoBack = () => {
    if (window.history.length > 2) {
      navigate(-1);
    } else {
      navigate("/dashboard");
    }
  };

  const handleGoHome = () => {
    navigate("/dashboard");
  };

  return (
    <NotFound
      theme={theme}
      onHome={handleGoHome}
      onBack={handleGoBack}
    />
  );
};

export default NotFoundScreen;
