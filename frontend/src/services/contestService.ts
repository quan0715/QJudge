import { authFetch } from './auth';
import type { Contest, ContestDetail, ContestQuestion } from '@/models/contest';
import type { Problem } from '@/models/problem';

export const contestService = {
  getContests: async (scope?: string): Promise<Contest[]> => {
    const query = scope ? `?scope=${scope}` : '';
    const res = await authFetch(`/api/v1/contests/${query}`);
    if (!res.ok) throw new Error('Failed to fetch contests');
    const data = await res.json();
    return data.results || data;
  },

  getContest: async (id: string): Promise<ContestDetail | undefined> => {
    const res = await authFetch(`/api/v1/contests/${id}/`);
    return res.json();
  },

  getContestProblem: async (contestId: string, problemId: string): Promise<any | undefined> => {
    const res = await authFetch(`/api/v1/contests/${contestId}/problems/${problemId}/`);
    if (!res.ok) return undefined;
    return res.json();
  },

  createContest: async (data: any): Promise<Contest> => {
    const res = await authFetch('/api/v1/contests/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.detail || 'Failed to create contest');
    }
    return res.json();
  },

  updateContest: async (id: string, data: any): Promise<Contest> => {
    const res = await authFetch(`/api/v1/contests/${id}/`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.detail || 'Failed to update contest');
    }
    return res.json();
  },

  toggleStatus: async (id: string): Promise<{ status: string }> => {
    const res = await authFetch(`/api/v1/contests/${id}/toggle_status/`, {
      method: 'POST'
    });
    if (!res.ok) throw new Error('Failed to toggle contest status');
    return res.json();
  },

  deleteContest: async (id: string): Promise<void> => {
    const res = await authFetch(`/api/v1/contests/${id}/`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Failed to delete contest');
  },

  registerContest: async (id: string, password?: string): Promise<any> => {
    const res = await authFetch(`/api/v1/contests/${id}/register/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ password })
    });
    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.message || 'Registration failed');
    }
    return res.json();
  },

  enterContest: async (id: string): Promise<any> => {
    const res = await authFetch(`/api/v1/contests/${id}/enter/`, {
      method: 'POST'
    });
    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.message || 'Failed to enter contest');
    }
    return res.json();
  },

  leaveContest: async (id: string): Promise<any> => {
    const res = await authFetch(`/api/v1/contests/${id}/leave/`, {
      method: 'POST'
    });
    if (!res.ok) throw new Error('Failed to leave contest');
    return res.json();
  },

  getContestAnnouncements: async (id: string): Promise<any[]> => {
    const res = await authFetch(`/api/v1/contests/${id}/announcements/`);
    if (!res.ok) throw new Error('Failed to fetch announcements');
    return res.json();
  },

  createContestAnnouncement: async (contestId: string, data: { title: string; content: string }): Promise<any> => {
    const res = await authFetch(`/api/v1/contests/${contestId}/announcements/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to create announcement');
    return res.json();
  },

  deleteContestAnnouncement: async (contestId: string, announcementId: string): Promise<void> => {
    const res = await authFetch(`/api/v1/contests/${contestId}/announcements/${announcementId}/`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Failed to delete announcement');
  },

  getContestStandings: async (id: string): Promise<any> => {
    const res = await authFetch(`/api/v1/contests/${id}/standings/`);
    if (!res.ok) throw new Error('Failed to fetch standings');
    return res.json();
  },

  addContestProblem: async (contestId: string, data: { title?: string; problem_id?: string }): Promise<Problem> => {
    const res = await authFetch(`/api/v1/contests/${contestId}/add_problem/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Failed to add problem');
    }
    return res.json();
  },

  createContestProblem: async (contestId: string, data: any): Promise<Problem> => {
    const res = await authFetch(`/api/v1/contests/${contestId}/problems/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Failed to create problem');
    }
    return res.json();
  },

  removeContestProblem: async (contestId: string, problemId: string): Promise<void> => {
    const res = await authFetch(`/api/v1/contests/${contestId}/problems/${problemId}/`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Failed to remove problem');
  },

  endContest: async (contestId: string): Promise<any> => {
    const res = await authFetch(`/api/v1/contests/${contestId}/end_contest/`, {
      method: 'POST'
    });
    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.message || 'Failed to end contest');
    }
    return res.json();
  },

  publishProblemToPractice: async (contestId: string, problemId: string): Promise<any> => {
    const res = await authFetch(`/api/v1/contests/${contestId}/problems/${problemId}/publish/`, {
      method: 'POST'
    });
    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.message || 'Failed to publish problem');
    }
    return res.json();
  },

  getContestQuestions: async (contestId: string): Promise<ContestQuestion[]> => {
    const res = await authFetch(`/api/v1/contests/${contestId}/questions/`);
    if (!res.ok) throw new Error('Failed to fetch questions');
    return res.json();
  },

  createContestQuestion: async (contestId: string, data: { title: string; content: string }): Promise<ContestQuestion> => {
    const res = await authFetch(`/api/v1/contests/${contestId}/questions/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to post question');
    return res.json();
  },

  answerContestQuestion: async (contestId: string, questionId: string, answer: string): Promise<ContestQuestion> => {
    const res = await authFetch(`/api/v1/contests/${contestId}/questions/${questionId}/answer/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer })
    });
    if (!res.ok) throw new Error('Failed to answer question');
    return res.json();
  },

  archiveContest: async (contestId: string): Promise<void> => {
    const res = await authFetch(`/api/v1/contests/${contestId}/archive/`, {
      method: 'POST'
    });
    if (!res.ok) throw new Error('Failed to archive contest');
  },

  startExam: async (contestId: string): Promise<any> => {
    const res = await authFetch(`/api/v1/contests/${contestId}/exam/start/`, {
      method: 'POST'
    });
    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.message || 'Failed to start exam');
    }
    return res.json();
  },

  endExam: async (contestId: string): Promise<any> => {
    const res = await authFetch(`/api/v1/contests/${contestId}/exam/end/`, {
      method: 'POST'
    });
    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.message || 'Failed to end exam');
    }
    return res.json();
  },

  recordExamEvent: async (contestId: string, eventType: string, lockReason?: string): Promise<any> => {
    const res = await authFetch(`/api/v1/contests/${contestId}/exam/events/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        event_type: eventType,
        lock_reason: lockReason
      })
    });
    if (!res.ok) {
      console.error('Failed to record exam event:', eventType);
      return null;
    }
    return res.json();
  },

  getExamEvents: async (contestId: string): Promise<any[]> => {
    const res = await authFetch(`/api/v1/contests/${contestId}/exam/events/`);
    if (!res.ok) throw new Error('Failed to fetch exam events');
    return res.json();
  },

  getScoreboard: async (contestId: string): Promise<any> => {
    const res = await authFetch(`/api/v1/contests/${contestId}/standings/`);
    if (!res.ok) {
      if (res.status === 403) {
        throw new Error('Scoreboard not available yet');
      }
      throw new Error('Failed to fetch scoreboard');
    }
    return res.json();
  },

  getClarifications: async (contestId: string): Promise<any[]> => {
    const res = await authFetch(`/api/v1/contests/${contestId}/clarifications/`);
    if (!res.ok) throw new Error('Failed to fetch clarifications');
    return res.json();
  },

  createClarification: async (contestId: string, data: { 
    question: string; 
    problem_id?: string 
  }): Promise<any> => {
    const res = await authFetch(`/api/v1/contests/${contestId}/clarifications/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to create clarification');
    return res.json();
  },

  replyClarification: async (
    contestId: string, 
    clarificationId: string, 
    reply: string, 
    isPublic: boolean
  ): Promise<any> => {
    const res = await authFetch(
      `/api/v1/contests/${contestId}/clarifications/${clarificationId}/reply/`, 
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer: reply, is_public: isPublic })
      }
    );
    if (!res.ok) throw new Error('Failed to reply to clarification');
    return res.json();
  },

  deleteClarification: async (contestId: string, clarificationId: string): Promise<void> => {
    const res = await authFetch(
      `/api/v1/contests/${contestId}/clarifications/${clarificationId}/`, 
      {
        method: 'DELETE'
      }
    );
    if (!res.ok) throw new Error('Failed to delete clarification');
  },

  getContestParticipants: async (contestId: string): Promise<any[]> => {
    const res = await authFetch(`/api/v1/contests/${contestId}/participants/`);
    if (!res.ok) throw new Error('Failed to fetch participants');
    return res.json();
  },

  unlockParticipant: async (contestId: string, userId: number): Promise<void> => {
    const res = await authFetch(`/api/v1/contests/${contestId}/unlock_participant/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId })
    });
    if (!res.ok) throw new Error('Failed to unlock participant');
  },

  updateParticipant: async (contestId: string, userId: number, data: any): Promise<void> => {
    const res = await authFetch(`/api/v1/contests/${contestId}/update_participant/`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, ...data })
    });
    if (!res.ok) throw new Error('Failed to update participant');
  },

  addParticipant: async (contestId: string, username: string): Promise<void> => {
    const res = await authFetch(`/api/v1/contests/${contestId}/add_participant/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username })
    });
    if (!res.ok) throw new Error('Failed to add participant');
  },
};
