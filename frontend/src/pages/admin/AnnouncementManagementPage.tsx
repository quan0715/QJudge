import { useState, useEffect } from 'react';
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
  Tag
} from '@carbon/react';
import { Add, Edit, TrashCan } from '@carbon/icons-react';
import { announcementService } from '@/services/announcementService';
import type { Announcement, CreateAnnouncementRequest } from '@/services/announcementService';

const headers = [
  { key: 'title', header: '標題' },
  { key: 'author', header: '作者' },
  { key: 'visible', header: '狀態' },
  { key: 'created_at', header: '建立時間' },
  { key: 'actions', header: '操作' },
];

const AnnouncementManagementPage = () => {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [firstRowIndex, setFirstRowIndex] = useState(0);
  const [currentPageSize, setCurrentPageSize] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);
  const [deletingAnnouncement, setDeletingAnnouncement] = useState<Announcement | null>(null);
  
  // Form State
  const [formData, setFormData] = useState<CreateAnnouncementRequest>({
    title: '',
    content: '',
    visible: true
  });

  const fetchAnnouncements = async () => {
    try {
      setLoading(true);
      const data = await announcementService.getAll();
      setAnnouncements(data);
    } catch (error) {
      console.error('Failed to fetch announcements', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const handleOpenCreateModal = () => {
    setEditingAnnouncement(null);
    setFormData({ title: '', content: '', visible: true });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (announcement: Announcement) => {
    setEditingAnnouncement(announcement);
    setFormData({
      title: announcement.title,
      content: announcement.content,
      visible: announcement.visible
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
        await announcementService.update(editingAnnouncement.id, formData);
      } else {
        await announcementService.create(formData);
      }
      setIsModalOpen(false);
      fetchAnnouncements();
    } catch (error) {
      console.error('Failed to save announcement', error);
      alert('儲存失敗');
    }
  };

  const handleDelete = async () => {
    if (!deletingAnnouncement) return;
    try {
      await announcementService.delete(deletingAnnouncement.id);
      setIsDeleteModalOpen(false);
      setDeletingAnnouncement(null);
      fetchAnnouncements();
    } catch (error) {
      console.error('Failed to delete announcement', error);
      alert('刪除失敗');
    }
  };

  // Filter and Pagination
  const filteredAnnouncements = announcements.filter(item => 
    item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.content.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const currentRows = filteredAnnouncements.slice(
    firstRowIndex,
    firstRowIndex + currentPageSize
  ).map(a => ({ ...a, id: a.id.toString() }));

  return (
    <div style={{ padding: '2rem' }}>
      <h2 style={{ marginBottom: '2rem' }}>公告管理</h2>
      
      <DataTable rows={currentRows} headers={headers} isSortable>
        {({ rows, headers, getHeaderProps, getTableProps }) => (
          <TableContainer title="系統公告列表" description={loading ? '載入中...' : ''}>
            <TableToolbar>
              <TableToolbarContent>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <TableToolbarSearch onChange={(e: any) => setSearchTerm(e.target ? e.target.value : '')} placeholder="搜尋公告" />
                <Button renderIcon={Add} onClick={handleOpenCreateModal}>
                  新增公告
                </Button>
              </TableToolbarContent>
            </TableToolbar>
            <Table {...getTableProps()}>
              <TableHead>
                <TableRow>
                  {headers.map((header) => (
                    <TableHeader {...getHeaderProps({ header })}>
                      {header.header}
                    </TableHeader>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => {
                  const announcement = announcements.find(a => a.id.toString() === row.id);
                  if (!announcement) return null;

                  return (
                    <TableRow key={row.id}>
                      <TableCell>{announcement.title}</TableCell>
                      <TableCell>{announcement.author?.username}</TableCell>
                      <TableCell>
                        {announcement.visible ? (
                          <Tag type="green">已發布</Tag>
                        ) : (
                          <Tag type="gray">隱藏</Tag>
                        )}
                      </TableCell>
                      <TableCell>{new Date(announcement.created_at).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <Button 
                            kind="ghost" 
                            size="sm" 
                            renderIcon={Edit} 
                            iconDescription="編輯" 
                            hasIconOnly 
                            onClick={() => handleOpenEditModal(announcement)}
                          />
                          <Button 
                            kind="danger--ghost" 
                            size="sm" 
                            renderIcon={TrashCan} 
                            iconDescription="刪除" 
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
        backwardText="上一頁"
        forwardText="下一頁"
        pageSize={currentPageSize}
        pageSizes={[10, 25, 50]}
        itemsPerPageText="每頁顯示"
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
        modalHeading={editingAnnouncement ? "編輯公告" : "新增公告"}
        primaryButtonText={editingAnnouncement ? "儲存" : "新增"}
        secondaryButtonText="取消"
        onRequestClose={() => setIsModalOpen(false)}
        onRequestSubmit={handleSubmit}
      >
        <TextInput
          id="title"
          labelText="標題"
          placeholder="請輸入公告標題"
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          style={{ marginBottom: '1rem' }}
        />
        <TextArea
          id="content"
          labelText="內容"
          placeholder="請輸入公告內容"
          value={formData.content}
          onChange={(e) => setFormData({ ...formData, content: e.target.value })}
          style={{ marginBottom: '1rem' }}
          rows={5}
        />
        <Toggle
          id="visible"
          labelText="是否發布"
          labelA="隱藏"
          labelB="發布"
          toggled={formData.visible}
          onToggle={(toggled) => setFormData({ ...formData, visible: toggled })}
        />
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={isDeleteModalOpen}
        danger
        modalHeading="刪除公告"
        primaryButtonText="刪除"
        secondaryButtonText="取消"
        onRequestClose={() => setIsDeleteModalOpen(false)}
        onRequestSubmit={handleDelete}
      >
        <p>您確定要刪除公告「{deletingAnnouncement?.title}」嗎？此動作無法復原。</p>
      </Modal>
    </div>
  );
};

export default AnnouncementManagementPage;
