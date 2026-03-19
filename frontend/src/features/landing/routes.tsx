import { Route } from "react-router";
import LandingScreen from "./screens/LandingScreen";

/**
 * Public landing route (no auth required)
 * This is the default homepage for unauthenticated users
 */
export const landingRoute = (
  <Route path="/" element={<LandingScreen />} />
);
