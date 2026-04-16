import { Outlet, useLocation } from "react-router-dom";
import { Content } from "@carbon/react";
import { GlobalHeader } from "./GlobalHeader";
import { ChatbotWidget } from "@/features/chatbot/components/ChatbotWidget";

const MainLayout = () => {
  const location = useLocation();
  const isFullBleed = location.pathname === "/chat";

  return (
    <>
      <GlobalHeader />
      <div
        style={{
          display: "flex",
          height: "calc(100dvh - 48px)",
          marginTop: "48px",
          overflow: "hidden",
        }}
      >
        {isFullBleed ? (
          <div style={{ flex: 1, overflow: "hidden", position: "relative", height: "100%" }}>
            <Outlet />
          </div>
        ) : (
          <Content style={{ flex: 1, overflow: "auto", marginTop: 0 }}>
            <Outlet />
          </Content>
        )}
        <ChatbotWidget />
      </div>
    </>
  );
};

export default MainLayout;
