import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal, StructuredListWrapper, StructuredListHead, StructuredListRow, StructuredListCell, StructuredListBody, RadioButton } from "@carbon/react";
import { getContests } from "@/infrastructure/api/repositories/contest.repository";
import { bindContest } from "@/infrastructure/api/repositories/classroom.repository";
import type { Contest } from "@/core/entities/contest.entity";

interface BindContestModalProps {
  open: boolean;
  classroomId: string;
  boundContestIds: string[];
  onClose: () => void;
  onBound: () => void;
}

export const BindContestModal: React.FC<BindContestModalProps> = ({
  open,
  classroomId,
  boundContestIds,
  onClose,
  onBound,
}) => {
  const { t } = useTranslation("classroom");
  const [contests, setContests] = useState<Contest[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    getContests("manage").then((data) => {
      const available = data.filter(
        (c) => !boundContestIds.includes(c.id)
      );
      setContests(available);
    });
  }, [open, boundContestIds]);

  const handleSubmit = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      await bindContest(classroomId, selected);
      setSelected(null);
      onBound();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onRequestClose={() => { setSelected(null); onClose(); }}
      onRequestSubmit={handleSubmit}
      modalHeading={t("bindContest.modal.title")}
      primaryButtonText={submitting ? t("bindContest.modal.submitting") : t("bindContest.modal.submit")}
      primaryButtonDisabled={submitting || !selected}
      secondaryButtonText={t("bindContest.modal.cancel")}
    >
      {contests.length === 0 ? (
        <p style={{ color: "var(--cds-text-secondary)" }}>{t("bindContest.modal.noContests")}</p>
      ) : (
        <StructuredListWrapper selection>
          <StructuredListHead>
            <StructuredListRow head>
              <StructuredListCell head />
              <StructuredListCell head>{t("bindContest.modal.table.name")}</StructuredListCell>
              <StructuredListCell head>{t("bindContest.modal.table.status")}</StructuredListCell>
            </StructuredListRow>
          </StructuredListHead>
          <StructuredListBody>
            {contests.map((c) => (
              <StructuredListRow
                key={c.id}
                onClick={() => setSelected(c.id)}
                style={{ cursor: "pointer" }}
              >
                <StructuredListCell>
                  <RadioButton
                    id={`contest-${c.id}`}
                    labelText=""
                    name="select-contest"
                    checked={selected === c.id}
                    onChange={() => setSelected(c.id)}
                  />
                </StructuredListCell>
                <StructuredListCell>{c.name}</StructuredListCell>
                <StructuredListCell>{c.status}</StructuredListCell>
              </StructuredListRow>
            ))}
          </StructuredListBody>
        </StructuredListWrapper>
      )}
    </Modal>
  );
};
