import { Outlet } from "react-router-dom";
import { Content } from "@carbon/react";
import { GlobalHeader } from "./GlobalHeader";
import { ChatbotWidget } from "@/features/chatbot/components/ChatbotWidget";

const MainLayout = () => {
  return (
    <>
      <GlobalHeader />
      <Content>
        <Outlet />
      </Content>
      <ChatbotWidget />
    </>
  );
};

export default MainLayout;
