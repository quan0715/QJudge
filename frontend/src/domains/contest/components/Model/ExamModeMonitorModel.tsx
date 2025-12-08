import {
  Modal,
  UnorderedList,
  ListItem,
} from '@carbon/react';
import { View, Warning } from '@carbon/icons-react';

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
            modalHeading="考試監控中"
            passiveModal
            onRequestClose={onRequestClose}
            size="sm"
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {/* Header with icon */}
                <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '0.75rem',
                    padding: '1rem',
                    backgroundColor: 'var(--cds-notification-background-warning)',
                    borderLeft: '3px solid var(--cds-support-warning)'
                }}>
                    <View size={24} style={{ color: 'var(--cds-support-warning)', flexShrink: 0 }} />
                    <span style={{ 
                        fontSize: 'var(--cds-body-compact-01-font-size, 0.875rem)',
                        fontWeight: 600,
                        color: 'var(--cds-text-primary)'
                    }}>
                        本考試已啟用防作弊監控系統
                    </span>
                </div>

                {/* Rules section */}
                <div>
                    <p style={{ 
                        fontSize: 'var(--cds-body-compact-01-font-size, 0.875rem)',
                        fontWeight: 600, 
                        marginBottom: '0.75rem',
                        color: 'var(--cds-text-primary)'
                    }}>
                        請注意以下規則：
                    </p>
                    <UnorderedList>
                        <ListItem>禁止切換瀏覽器分頁 (Tab Switching)</ListItem>
                        <ListItem>禁止離開全螢幕模式 (Exit Fullscreen)</ListItem>
                        <ListItem>禁止將視窗縮小或切換至其他應用程式 (Window Blur)</ListItem>
                    </UnorderedList>
                </div>

                {/* Warning message */}
                <div style={{ 
                    padding: '1rem',
                    backgroundColor: 'var(--cds-layer-01)',
                    borderRadius: '4px',
                    border: '1px solid var(--cds-border-subtle)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                        <Warning size={20} style={{ color: 'var(--cds-support-error)', flexShrink: 0, marginTop: '2px' }} />
                        <p style={{ 
                            fontSize: 'var(--cds-body-compact-01-font-size, 0.875rem)',
                            color: 'var(--cds-text-primary)',
                            margin: 0,
                            lineHeight: 1.5
                        }}>
                            違反上述規則將會被系統記錄，超過次數限制將會被<strong style={{ color: 'var(--cds-support-error)' }}>自動鎖定</strong>並無法繼續考試。
                        </p>
                    </div>
                </div>
            </div>
        </Modal> 
    )
}

