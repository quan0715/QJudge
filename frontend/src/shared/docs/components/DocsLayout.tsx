import { Outlet } from "react-router-dom";
import { Content } from "@carbon/react";
import DocsHeader from "./DocsHeader";
import styles from "./DocsLayout.module.scss";

const DocsLayout: React.FC = () => {
  return (
    <div className={styles.layout}>
      <DocsHeader />
      <Content className={styles.content} tagName="div">
        <Outlet />
      </Content>
    </div>
  );
};

export default DocsLayout;
