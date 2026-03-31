import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button, Theme, Tile } from "@carbon/react";
import { CheckmarkFilled } from "@carbon/icons-react";
import { useCustomer } from "recur-tw";
import styles from "./CheckoutSuccessScreen.module.scss";

export default function CheckoutSuccessScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const { refetch } = useCustomer();

  useEffect(() => {
    // Refresh entitlements from Recur after checkout
    refetch();
  }, [refetch]);

  return (
    <Theme theme="g10">
      <div className={styles.container}>
        <Tile className={styles.card}>
          <CheckmarkFilled size={48} className={styles.icon} />
          <h1 className={styles.title}>訂閱成功！</h1>
          <p className={styles.message}>
            感謝你的訂閱，你的帳戶已升級。
          </p>
          {sessionId && (
            <p className={styles.sessionId}>
              訂單編號：{sessionId}
            </p>
          )}
          <div className={styles.actions}>
            <Button kind="primary" onClick={() => navigate("/dashboard")}>
              前往儀表板
            </Button>
            <Button kind="tertiary" onClick={() => navigate("/settings")}>
              查看訂閱
            </Button>
          </div>
        </Tile>
      </div>
    </Theme>
  );
}
