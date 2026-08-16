const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: string;
  organization: number | null;
}

export interface LoginResponse {
  access: string;
  refresh: string;
  user: AuthUser;
}

class ApiClient {
  private accessToken: string | null = null;

  setToken(token: string | null) {
    this.accessToken = token;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };
    if (this.accessToken) {
      headers.Authorization = `Bearer ${this.accessToken}`;
    }

    const response = await fetch(`${API_BASE}${path}`, { ...options, headers });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: response.statusText }));
      throw new Error(error.detail || 'Request failed');
    }

    if (response.status === 204) {
      return undefined as T;
    }
    return response.json();
  }

  login(email: string, password: string) {
    return this.request<LoginResponse>('/auth/login/', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  me() {
    return this.request<AuthUser & { organization_name?: string }>('/auth/me/');
  }

  logout(refresh: string) {
    return this.request('/auth/logout/', {
      method: 'POST',
      body: JSON.stringify({ refresh }),
    });
  }
}

export const apiClient = new ApiClient();
