/**
 * Announcement Entity
 *
 * System-wide announcement types shared across the application.
 */

export interface Announcement {
  id: number;
  title: string;
  content: string;
  author: {
    username: string;
    role: string;
  };
  visible: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateAnnouncementRequest {
  title: string;
  content: string;
  visible?: boolean;
}

export interface UpdateAnnouncementRequest {
  title?: string;
  content?: string;
  visible?: boolean;
}
