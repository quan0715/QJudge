import { lazy } from "react";
import { Route } from "react-router-dom";
import { RouteLoadingBoundary } from "@/shared/ui/RouteLoadingBoundary";
import SystemLayout from "./components/SystemLayout";

const SystemOverviewScreen = lazy(() => import("./screens/SystemOverviewScreen"));
const UserManagementScreen = lazy(() => import("./screens/UserManagementScreen"));
const ServiceStatusScreen = lazy(() => import("./screens/ServiceStatusScreen"));
const IngressScreen = lazy(() => import("./screens/IngressScreen"));

export const adminRoutes = (
  <Route path="/system" element={<SystemLayout />}>
    <Route
      index
      element={
        <RouteLoadingBoundary>
          <SystemOverviewScreen />
        </RouteLoadingBoundary>
      }
    />
    <Route
      path="users"
      element={
        <RouteLoadingBoundary>
          <UserManagementScreen />
        </RouteLoadingBoundary>
      }
    />
    <Route
      path="service-status"
      element={
        <RouteLoadingBoundary>
          <ServiceStatusScreen />
        </RouteLoadingBoundary>
      }
    />
    <Route
      path="ingress"
      element={
        <RouteLoadingBoundary>
          <IngressScreen />
        </RouteLoadingBoundary>
      }
    />
  </Route>
);
