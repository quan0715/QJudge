import { authFetch } from './auth';
import type { Tag } from '@/core/entities/problem.entity';
import { mapTagDto } from '@/core/entities/mappers/problemMapper';

export const tagService = {
  /**
   * Get all tags
   */
  async getTags(): Promise<Tag[]> {
    const res = await authFetch('/api/v1/problems/tags/');
    if (!res.ok) throw new Error('Failed to fetch tags');
    const data = await res.json();
    if (data.results && Array.isArray(data.results)) {
        return data.results.map(mapTagDto);
    }
    return Array.isArray(data) ? data.map(mapTagDto) : [];
  },

  /**
   * Get tag by slug
   */
  async getTag(slug: string): Promise<Tag> {
    const res = await authFetch(`/api/v1/problems/tags/${slug}/`);
    if (!res.ok) throw new Error('Failed to fetch tag');
    const data = await res.json();
    return mapTagDto(data);
  },

  /**
   * Create a new tag (admin only)
   */
  async createTag(data: { name: string; slug: string; description?: string; color?: string }): Promise<Tag> {
    const res = await authFetch('/api/v1/problems/tags/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to create tag');
    const responseData = await res.json();
    return mapTagDto(responseData);
  },

  /**
   * Update a tag (admin only)
   */
  async updateTag(slug: string, data: Partial<{ name: string; description: string; color: string }>): Promise<Tag> {
    const res = await authFetch(`/api/v1/problems/tags/${slug}/`, {
      method: 'PATCH', // Usually PATCH for partial updates
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to update tag');
    const responseData = await res.json();
    return mapTagDto(responseData);
  },

  /**
   * Delete a tag (admin only)
   */
  async deleteTag(slug: string): Promise<void> {
    const res = await authFetch(`/api/v1/problems/tags/${slug}/`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Failed to delete tag');
  }
};
