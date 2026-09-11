import { lazy } from "react";
import { Route } from "react-router-dom";
import { RouteLoadingBoundary } from "@/shared/ui/RouteLoadingBoundary";

const UserManagementScreen = lazy(() => import("./screens/UserManagementScreen"));
const ServiceStatusScreen = lazy(() => import("./screens/ServiceStatusScreen"));

export const adminRoutes = (
  <>
    <Route
      path="/system/users"
      element={
        <RouteLoadingBoundary>
          <UserManagementScreen />
        </RouteLoadingBoundary>
      }
    />
    <Route
      path="/system/service-status"
      element={
        <RouteLoadingBoundary>
          <ServiceStatusScreen />
        </RouteLoadingBoundary>
      }
    />
  </>
);
