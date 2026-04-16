import { GlobalHeader } from "@/features/app/components/GlobalHeader";
import ChatFullPage from "./ChatFullPage";
import styles from "./ChatStandalonePage.module.scss";

export default function ChatStandalonePage() {
  return (
    <div className={styles.pageRoot}>
      <GlobalHeader />
      <main className={styles.main}>
        <ChatFullPage />
      </main>
    </div>
  );
}
