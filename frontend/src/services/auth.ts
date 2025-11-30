export const clearAuthStorage = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.dispatchEvent(new Event('storage'));
};

export const redirectToLogin = () => {
  if (!window.location.pathname.startsWith('/login')) {
    window.location.href = '/login';
  }
};

export const handleUnauthorized = (response: Response): boolean => {
  if (response.status === 401) {
    clearAuthStorage();
    redirectToLogin();
    return true;
  }
  return false;
};

export const authFetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
  const headers = new Headers(init.headers || {});
  const token = localStorage.getItem('token');

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(input, { ...init, headers });

  if (handleUnauthorized(response)) {
    throw new Error('Unauthorized');
  }

  return response;
};
