import styles from "./ShutterRow.module.scss";

type Props = {
  onShutter: () => void;
  shutterDisabled: boolean;
  shutterLabel: string;
};

export function ShutterRow({ onShutter, shutterDisabled, shutterLabel }: Props) {
  return (
    <div className={styles.row}>
      <button
        type="button"
        className={styles.shutter}
        onClick={onShutter}
        disabled={shutterDisabled}
        aria-label={shutterLabel}
      >
        <span />
      </button>
    </div>
  );
}
