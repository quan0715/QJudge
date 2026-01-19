import { Outlet } from "react-router-dom";
import { Content } from "@carbon/react";
import { GlobalHeader } from "./GlobalHeader";

const MainLayout = () => {
  return (
    <>
      <GlobalHeader />
      <Content>
        <Outlet />
      </Content>
    </>
  );
};

export default MainLayout;
