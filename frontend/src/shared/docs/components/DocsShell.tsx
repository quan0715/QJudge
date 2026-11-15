import { Outlet } from "react-router-dom";
import { Content } from "@carbon/react";
import DocsHeader from "./DocsHeader";
import styles from "./DocsShell.module.scss";

const DocsShell: React.FC = () => {
  return (
    <div className={styles.layout}>
      <DocsHeader />
      <Content className={styles.content} tagName="div">
        <Outlet />
      </Content>
    </div>
  );
};

export default DocsShell;
