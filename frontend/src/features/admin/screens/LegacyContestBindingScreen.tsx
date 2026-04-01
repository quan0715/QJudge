import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Column,
  Grid,
  InlineLoading,
  Search,
  Select,
  SelectItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
  Tile,
} from "@carbon/react";
import type { Classroom } from "@/core/entities/classroom.entity";
import type { Contest } from "@/core/entities/contest.entity";
import { PageHeader } from "@/shared/layout/PageHeader";
import { useToast } from "@/shared/contexts/ToastContext";
import {
  bindContest,
  getClassroomContests,
  getClassrooms,
} from "@/infrastructure/api/repositories/classroom.repository";
import { getContests } from "@/infrastructure/api/repositories/contest.repository";

const STATUS_LABELS: Record<Contest["status"], { text: string; type: "blue" | "cool-gray" | "green" }> = {
  draft: { text: "Draft", type: "cool-gray" },
  published: { text: "Published", type: "green" },
  archived: { text: "Archived", type: "blue" },
};

const VISIBILITY_LABELS: Record<Contest["visibility"], string> = {
  public: "Public",
  private: "Private",
};

const DELIVERY_MODE_LABELS = {
  exam: "Exam",
  practice: "Practice",
} as const;

const LegacyContestBindingScreen = () => {
  const { showToast } = useToast();
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [legacyContests, setLegacyContests] = useState<Contest[]>([]);
  const [selectedClassroomId, setSelectedClassroomId] = useState("");
  const [searchValue, setSearchValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [bindingContestId, setBindingContestId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");

  const loadData = async () => {
    setLoading(true);
    setLoadError("");

    try {
      const [manageableClassrooms, manageableContests] = await Promise.all([
        getClassrooms("manage"),
        getContests("manage"),
      ]);

      const classroomContestGroups = await Promise.all(
        manageableClassrooms.map((classroom) => getClassroomContests(classroom.id))
      );
      const boundContestIds = new Set(
        classroomContestGroups.flatMap((rows) => rows.map((row) => row.contestId))
      );
      const unboundContests = manageableContests.filter(
        (contest) => !boundContestIds.has(contest.id)
      );

      setClassrooms(manageableClassrooms);
      setLegacyContests(unboundContests);
      setSelectedClassroomId((current) => {
        if (
          current &&
          manageableClassrooms.some((classroom) => classroom.id === current)
        ) {
          return current;
        }
        return manageableClassrooms[0]?.id ?? "";
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load admin data";
      setLoadError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const filteredContests = useMemo(() => {
    const keyword = searchValue.trim().toLowerCase();
    if (!keyword) return legacyContests;
    return legacyContests.filter((contest) => {
      const haystacks = [
        contest.name,
        contest.description,
        contest.organizer,
        contest.deliveryMode,
        contest.status,
      ];
      return haystacks.some((value) =>
        String(value || "").toLowerCase().includes(keyword)
      );
    });
  }, [legacyContests, searchValue]);

  const selectedClassroom = classrooms.find(
    (classroom) => classroom.id === selectedClassroomId
  );

  const handleBindContest = async (contest: Contest) => {
    if (!selectedClassroomId) {
      showToast({
        kind: "warning",
        title: "Select a classroom first",
      });
      return;
    }

    setBindingContestId(contest.id);
    try {
      await bindContest(selectedClassroomId, contest.id);
      showToast({
        kind: "success",
        title: "Contest bound",
        subtitle: `${contest.name} -> ${selectedClassroom?.name || "classroom"}`,
      });
      await loadData();
    } catch (error) {
      showToast({
        kind: "error",
        title: "Failed to bind contest",
        subtitle: error instanceof Error ? error.message : "Please try again",
      });
    } finally {
      setBindingContestId(null);
    }
  };

  return (
    <div style={{ padding: "1rem 2rem 2rem" }}>
      <PageHeader
        title="Legacy Contest Binding"
        subtitle="Bind old contests that do not yet belong to a classroom."
      />

      <Grid fullWidth condensed>
        <Column lg={16} md={8} sm={4}>
          <Tile
            style={{
              marginBottom: "1rem",
              display: "grid",
              gap: "1rem",
            }}
          >
            <div
              style={{
                display: "grid",
                gap: "1rem",
                gridTemplateColumns: "minmax(18rem, 24rem) minmax(16rem, 1fr)",
                alignItems: "end",
              }}
            >
              <Select
                id="legacy-contest-binding-classroom"
                labelText="Target classroom"
                value={selectedClassroomId}
                onChange={(event) => setSelectedClassroomId(event.target.value)}
              >
                {classrooms.length === 0 ? (
                  <SelectItem value="" text="No manageable classroom" />
                ) : (
                  classrooms.map((classroom) => (
                    <SelectItem
                      key={classroom.id}
                      value={classroom.id}
                      text={`${classroom.name} (${classroom.memberCount})`}
                    />
                  ))
                )}
              </Select>
              <Search
                id="legacy-contest-binding-search"
                labelText="Search contests"
                placeholder="Search by contest name or description"
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
              />
            </div>

            <div
              style={{
                display: "flex",
                gap: "1rem",
                flexWrap: "wrap",
                color: "var(--cds-text-secondary)",
                fontSize: "0.875rem",
              }}
            >
              <span>Classrooms: {classrooms.length}</span>
              <span>Unbound contests: {legacyContests.length}</span>
              {selectedClassroom ? (
                <span>Binding target: {selectedClassroom.name}</span>
              ) : null}
              {loading ? <InlineLoading description="Refreshing data" /> : null}
            </div>

            {loadError ? (
              <div style={{ color: "var(--cds-support-error)" }}>{loadError}</div>
            ) : null}
          </Tile>
        </Column>

        <Column lg={16} md={8} sm={4}>
          <Tile>
            {loading ? (
              <InlineLoading description="Loading legacy contests" />
            ) : filteredContests.length === 0 ? (
              <div style={{ color: "var(--cds-text-secondary)" }}>
                {legacyContests.length === 0
                  ? "No unbound contests found."
                  : "No contest matches the current search."}
              </div>
            ) : (
              <TableContainer title="Unbound contests">
                <Table useZebraStyles>
                  <TableHead>
                    <TableRow>
                      <TableHeader>Contest</TableHeader>
                      <TableHeader>Status</TableHeader>
                      <TableHeader>Mode</TableHeader>
                      <TableHeader>Visibility</TableHeader>
                      <TableHeader>Participants</TableHeader>
                      <TableHeader aria-label="actions" />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredContests.map((contest) => (
                      <TableRow key={contest.id}>
                        <TableCell>
                          <div
                            style={{
                              display: "grid",
                              gap: "0.25rem",
                            }}
                          >
                            <strong>{contest.name}</strong>
                            {contest.description ? (
                              <span
                                style={{ color: "var(--cds-text-secondary)" }}
                              >
                                {contest.description}
                              </span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Tag type={STATUS_LABELS[contest.status].type}>
                            {STATUS_LABELS[contest.status].text}
                          </Tag>
                        </TableCell>
                        <TableCell>
                          {contest.deliveryMode
                            ? DELIVERY_MODE_LABELS[contest.deliveryMode]
                            : "-"}
                        </TableCell>
                        <TableCell>{VISIBILITY_LABELS[contest.visibility]}</TableCell>
                        <TableCell>{contest.participantCount ?? 0}</TableCell>
                        <TableCell>
                          <Button
                            kind="primary"
                            size="sm"
                            disabled={!selectedClassroomId || bindingContestId === contest.id}
                            onClick={() => void handleBindContest(contest)}
                          >
                            {bindingContestId === contest.id ? "Binding..." : "Bind"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Tile>
        </Column>
      </Grid>
    </div>
  );
};

export default LegacyContestBindingScreen;
