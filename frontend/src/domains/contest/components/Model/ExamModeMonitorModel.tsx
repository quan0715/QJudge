import {
  Modal,
  InlineNotification,
} from '@carbon/react';

export const ExamModeMonitorModel = ({
    open,
    onRequestClose,
}: {
    open: boolean,
    onRequestClose: () => void,
}) => {

    return (
        <Modal
            open={open}
            modalHeading="考試監控中 (Monitoring Active)"
            passiveModal
            onRequestClose={onRequestClose}
            >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <InlineNotification
                kind="warning"
                title="警告"
                subtitle="本考試已啟用防作弊監控系統"
                hideCloseButton
                />
                <div>
                <p style={{ fontWeight: 600, marginBottom: '0.5rem' }}>請注意以下規則：</p>
                <ul style={{ listStyleType: 'disc', paddingLeft: '1.5rem' }}>
                    <li>禁止切換瀏覽器分頁 (Tab Switching)</li>
                    <li>禁止離開全螢幕模式 (Exit Fullscreen)</li>
                    <li>禁止將視窗縮小或切換至其他應用程式 (Window Blur)</li>
                </ul>
                </div>
                <p style={{ color: 'var(--cds-text-error)' }}>
                違反上述規則將會被系統記錄，超過次數限制將會被<strong>自動鎖定</strong>並無法繼續考試。
                </p>
            </div>
        </Modal> 
    )
}

