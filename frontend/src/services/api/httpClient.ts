export const clearAuthStorage = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.dispatchEvent(new Event('storage'));
};

const redirectToLogin = () => {
  if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
    window.location.href = '/login';
  }
};

const handleUnauthorized = (response: Response): boolean => {
  if (response.status === 401) {
    clearAuthStorage();
    redirectToLogin();
    return true;
  }
  return false;
};

// Base fetch wrapper
const customFetch = async (endpoint: string, init: RequestInit = {}) => {
  const headers = new Headers(init.headers || {});
  const token = localStorage.getItem('token');

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  
  // Ensure we accept JSON
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }

  // Auto-set Content-Type for POST/PUT if body is object? 
  // Standard fetch doesn't do this, but often useful.
  // For now, let's keep it simple or manual.

  const response = await fetch(endpoint, { ...init, headers });

  if (handleUnauthorized(response)) {
    throw new Error('Unauthorized');
  }

  return response;
};

export const httpClient = {
  request: customFetch,
  get: (url: string, init?: RequestInit) => customFetch(url, { ...init, method: 'GET' }),
  post: (url: string, body?: any, init?: RequestInit) => 
    customFetch(url, { 
      ...init, 
      method: 'POST', 
      body: JSON.stringify(body),
      headers: { ...init?.headers, 'Content-Type': 'application/json' } 
    }),
  put: (url: string, body?: any, init?: RequestInit) => 
    customFetch(url, { 
        ...init, 
        method: 'PUT', 
        body: JSON.stringify(body),
        headers: { ...init?.headers, 'Content-Type': 'application/json' }
    }),
  patch: (url: string, body?: any, init?: RequestInit) => 
    customFetch(url, { 
        ...init, 
        method: 'PATCH', 
        body: JSON.stringify(body),
        headers: { ...init?.headers, 'Content-Type': 'application/json' }
    }),
  delete: (url: string, init?: RequestInit) => customFetch(url, { ...init, method: 'DELETE' }),
};
