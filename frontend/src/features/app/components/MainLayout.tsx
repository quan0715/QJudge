import { Outlet } from "react-router-dom";
import { Content } from "@carbon/react";
import { GlobalHeader } from "./GlobalHeader";
import { ChatbotWidget } from "@/features/chatbot/components/ChatbotWidget";

const MainLayout = () => {
  return (
    <>
      <GlobalHeader />
      <div
        style={{
          display: "flex",
          height: "calc(100vh - 48px)", // below Carbon header
          marginTop: "48px",
          overflow: "hidden",
        }}
      >
        <Content style={{ flex: 1, overflow: "auto", marginTop: 0 }}>
          <Outlet />
        </Content>
        <ChatbotWidget />
      </div>
    </>
  );
};

export default MainLayout;
