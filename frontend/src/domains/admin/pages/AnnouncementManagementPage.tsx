import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  DataTable,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  TableContainer,
  TableToolbar,
  TableToolbarContent,
  TableToolbarSearch,
  Button,
  Pagination,
  Modal,
  TextInput,
  TextArea,
  Toggle,
  Tag,
} from "@carbon/react";
import { Add, Edit, TrashCan } from "@carbon/icons-react";
import {
  getAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  type Announcement,
  type CreateAnnouncementRequest,
} from "@/services/announcement";

const AnnouncementManagementPage = () => {
  const { t } = useTranslation("admin");
  const { t: tc } = useTranslation("common");

  const headers = [
    { key: "title", header: t("announcement.columns.title") },
    { key: "author", header: t("announcement.columns.author") },
    { key: "visible", header: t("announcement.columns.status") },
    { key: "created_at", header: t("announcement.columns.createdAt") },
    { key: "actions", header: t("announcement.columns.actions") },
  ];

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [firstRowIndex, setFirstRowIndex] = useState(0);
  const [currentPageSize, setCurrentPageSize] = useState(10);
  const [searchTerm, setSearchTerm] = useState("");

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] =
    useState<Announcement | null>(null);
  const [deletingAnnouncement, setDeletingAnnouncement] =
    useState<Announcement | null>(null);

  // Form State
  const [formData, setFormData] = useState<CreateAnnouncementRequest>({
    title: "",
    content: "",
    visible: true,
  });

  const fetchAnnouncements = async () => {
    try {
      setLoading(true);
      const data = await getAnnouncements();
      setAnnouncements(data);
    } catch (error) {
      console.error("Failed to fetch announcements", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const handleOpenCreateModal = () => {
    setEditingAnnouncement(null);
    setFormData({ title: "", content: "", visible: true });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (announcement: Announcement) => {
    setEditingAnnouncement(announcement);
    setFormData({
      title: announcement.title,
      content: announcement.content,
      visible: announcement.visible,
    });
    setIsModalOpen(true);
  };

  const handleOpenDeleteModal = (announcement: Announcement) => {
    setDeletingAnnouncement(announcement);
    setIsDeleteModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      if (editingAnnouncement) {
        await updateAnnouncement(editingAnnouncement.id, formData);
      } else {
        await createAnnouncement(formData);
      }
      setIsModalOpen(false);
      fetchAnnouncements();
    } catch (error) {
      console.error("Failed to save announcement", error);
      alert(tc("message.saveFailed"));
    }
  };

  const handleDelete = async () => {
    if (!deletingAnnouncement) return;
    if (!deletingAnnouncement) return;
    try {
      await deleteAnnouncement(deletingAnnouncement.id);
      setIsDeleteModalOpen(false);
      setDeletingAnnouncement(null);
      fetchAnnouncements();
    } catch (error) {
      console.error("Failed to delete announcement", error);
      alert(tc("message.deleteFailed"));
    }
  };

  // Filter and Pagination
  const filteredAnnouncements = announcements.filter(
    (item) =>
      item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.content.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const currentRows = filteredAnnouncements
    .slice(firstRowIndex, firstRowIndex + currentPageSize)
    .map((a) => ({ ...a, id: a.id.toString() }));

  return (
    <div style={{ padding: "2rem" }}>
      <h2 style={{ marginBottom: "2rem" }}>{t("announcement.management")}</h2>

      <DataTable rows={currentRows} headers={headers} isSortable>
        {({ rows, headers, getHeaderProps, getTableProps }) => (
          <TableContainer
            title={t("announcement.list")}
            description={loading ? tc("message.loading") : ""}
          >
            <TableToolbar>
              <TableToolbarContent>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <TableToolbarSearch
                  onChange={(e: any) =>
                    setSearchTerm(e.target ? e.target.value : "")
                  }
                  placeholder={t("announcement.search")}
                />
                <Button renderIcon={Add} onClick={handleOpenCreateModal}>
                  {t("announcement.create")}
                </Button>
              </TableToolbarContent>
            </TableToolbar>
            <Table {...getTableProps()}>
              <TableHead>
                <TableRow>
                  {headers.map((header) => {
                    const { key, ...headerProps } = getHeaderProps({ header });
                    return (
                      <TableHeader key={key} {...headerProps}>
                        {header.header}
                      </TableHeader>
                    );
                  })}
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => {
                  const announcement = announcements.find(
                    (a) => a.id.toString() === row.id
                  );
                  if (!announcement) return null;

                  return (
                    <TableRow key={row.id}>
                      <TableCell>{announcement.title}</TableCell>
                      <TableCell>{announcement.author?.username}</TableCell>
                      <TableCell>
                        {announcement.visible ? (
                          <Tag type="green">
                            {t("announcement.status.published")}
                          </Tag>
                        ) : (
                          <Tag type="gray">
                            {t("announcement.status.hidden")}
                          </Tag>
                        )}
                      </TableCell>
                      <TableCell>
                        {new Date(announcement.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div style={{ display: "flex", gap: "0.5rem" }}>
                          <Button
                            kind="ghost"
                            size="sm"
                            renderIcon={Edit}
                            iconDescription={tc("button.edit")}
                            hasIconOnly
                            onClick={() => handleOpenEditModal(announcement)}
                          />
                          <Button
                            kind="danger--ghost"
                            size="sm"
                            renderIcon={TrashCan}
                            iconDescription={tc("button.delete")}
                            hasIconOnly
                            onClick={() => handleOpenDeleteModal(announcement)}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DataTable>

      <Pagination
        totalItems={filteredAnnouncements.length}
        backwardText={tc("pagination.previous")}
        forwardText={tc("pagination.next")}
        pageSize={currentPageSize}
        pageSizes={[10, 25, 50]}
        itemsPerPageText={tc("pagination.itemsPerPage")}
        onChange={({ page, pageSize }) => {
          if (pageSize !== currentPageSize) {
            setCurrentPageSize(pageSize);
          }
          setFirstRowIndex((page - 1) * pageSize);
        }}
      />

      {/* Create/Edit Modal */}
      <Modal
        open={isModalOpen}
        modalHeading={
          editingAnnouncement
            ? t("announcement.edit")
            : t("announcement.create")
        }
        primaryButtonText={
          editingAnnouncement ? tc("button.save") : tc("button.create")
        }
        secondaryButtonText={tc("button.cancel")}
        onRequestClose={() => setIsModalOpen(false)}
        onRequestSubmit={handleSubmit}
      >
        <TextInput
          id="title"
          labelText={t("announcement.form.title")}
          placeholder={t("announcement.form.titlePlaceholder")}
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          style={{ marginBottom: "1rem" }}
        />
        <TextArea
          id="content"
          labelText={t("announcement.form.content")}
          placeholder={t("announcement.form.contentPlaceholder")}
          value={formData.content}
          onChange={(e) =>
            setFormData({ ...formData, content: e.target.value })
          }
          style={{ marginBottom: "1rem" }}
          rows={5}
        />
        <Toggle
          id="visible"
          labelText={t("announcement.form.publishLabel")}
          labelA={t("announcement.form.hidden")}
          labelB={t("announcement.form.published")}
          toggled={formData.visible}
          onToggle={(toggled) => setFormData({ ...formData, visible: toggled })}
        />
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={isDeleteModalOpen}
        danger
        modalHeading={t("announcement.delete")}
        primaryButtonText={tc("button.delete")}
        secondaryButtonText={tc("button.cancel")}
        onRequestClose={() => setIsDeleteModalOpen(false)}
        onRequestSubmit={handleDelete}
      >
        <p>
          {t("announcement.confirmDelete", {
            title: deletingAnnouncement?.title,
          })}
        </p>
      </Modal>
    </div>
  );
};

export default AnnouncementManagementPage;
