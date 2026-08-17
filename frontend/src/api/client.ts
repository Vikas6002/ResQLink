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

export interface EmergencyEvent {
  id: number;
  event_type: string;
  actor_name?: string;
  metadata: any;
  timestamp: string;
}

export interface Emergency {
  id: number;
  patient_reference: string;
  latitude: string;
  longitude: string;
  age: number;
  emergency_type: string;
  reported_conditions: string[];
  vital_data: any;
  ai_risk_score: number | null;
  ai_priority: string | null;
  verified_priority: string | null;
  status: string;
  created_by: number | null;
  created_by_name?: string;
  verified_by?: number | null;
  verified_by_name?: string;
  selected_hospital: number | null;
  selected_hospital_name?: string;
  created_at: string;
  updated_at: string;
  events?: EmergencyEvent[];
}

export interface AmbulanceEquipment {
  id: number;
  equipment_name: string;
  quantity: number;
  available: boolean;
}

export interface Ambulance {
  id: number;
  registration_number: string;
  organization: number;
  organization_name?: string;
  latitude: string;
  longitude: string;
  status: string;
  capability_level: string;
  current_emergency: number | null;
  equipment?: AmbulanceEquipment[];
}

export interface HospitalResource {
  id: number;
  resource_type: string;
  total: number;
  available: number;
  updated_at: string;
}

export interface Hospital {
  id: number;
  name: string;
  organization: number;
  organization_name?: string;
  latitude: string;
  longitude: string;
  status: string;
  emergency_department_status: string;
  resources?: HospitalResource[];
}

export interface HospitalAlert {
  id: number;
  emergency: number;
  emergency_detail?: Emergency;
  hospital: number;
  hospital_name?: string;
  priority: string;
  eta: number;
  status: string;
  created_at: string;
  acknowledged_at: string | null;
  preparation_started_at: string | null;
  ready_at: string | null;
  not_ready_at: string | null;
  not_ready_reason: string | null;
  responded_by_name?: string;
  readiness_checklist: any[];
}

export interface Handover {
  id: number;
  emergency: number;
  ambulance: number;
  hospital: number;
  submitted_by_name?: string;
  received_by_name?: string;
  arrival_time: string;
  submitted_at: string | null;
  accepted_at: string | null;
  status: string;
  notes: string;
}

export interface OptimizedRoute {
  route: {
    node_ids: number[];
    edge_ids: number[];
    route_nodes: any[];
    route_edges: any[];
  };
  distance: number;
  estimated_time: number;
  nodes: any[];
  edges: any[];
}

export interface OptimizeAmbulanceResponse {
  strategy: string;
  emergency_id: number;
  candidates: Array<{
    ambulance: string;
    ambulance_id: number;
    rank: number;
    score: number;
    eta_minutes: number;
    distance_km: number;
    capability_match: boolean;
    equipment_match: boolean;
    reason: string[];
  }>;
}

export interface OptimizeHospitalResponse {
  strategy: string;
  emergency_id: number;
  candidates: Array<{
    hospital: string;
    hospital_id: number;
    rank: number;
    score: number;
    eta_minutes: number;
    distance_km: number;
    resource_match: boolean;
    capacity: number;
    reasons: string[];
  }>;
}

export interface AssetChangeRequest {
  id: number;
  asset_type: 'HOSPITAL' | 'AMBULANCE';
  hospital: number | null;
  hospital_name?: string;
  ambulance: number | null;
  ambulance_number?: string;
  requested_changes: any[];
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  created_by: number;
  created_by_name?: string;
  created_at: string;
  reviewed_by: number | null;
  reviewed_by_name?: string;
  reviewed_at: string | null;
  rejection_reason: string | null;
}

class ApiClient {
  private accessToken: string | null = null;

  setToken(token: string | null) {
    this.accessToken = token;
  }

  getToken() {
    return this.accessToken;
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

  // User list
  getUsers() {
    return this.request<{ results: (AuthUser & { organization_name?: string })[] }>('/users/');
  }

  // Emergencies
  getEmergencies() {
    return this.request<{ results: Emergency[] }>('/emergencies/');
  }

  createEmergency(data: any) {
    return this.request<Emergency>('/emergencies/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  verifyEmergency(id: number, priority: string) {
    return this.request<Emergency>(`/emergencies/${id}/verify/`, {
      method: 'POST',
      body: JSON.stringify({ verified_priority: priority }),
    });
  }

  updateEmergencyStatus(id: number, status: string) {
    return this.request<Emergency>(`/emergencies/${id}/status/`, {
      method: 'PATCH',
      body: JSON.stringify(status),
    });
  }

  selectHospital(id: number, hospitalId: number) {
    return this.request<{ emergency: Emergency; alert: HospitalAlert }>(`/emergencies/${id}/select-hospital/`, {
      method: 'POST',
      body: JSON.stringify({ hospital_id: hospitalId }),
    });
  }

  approveReassignment(id: number, hospitalId: number) {
    return this.request<{ emergency: Emergency; alert: HospitalAlert }>(`/emergencies/${id}/approve-reassignment/`, {
      method: 'POST',
      body: JSON.stringify({ hospital_id: hospitalId }),
    });
  }

  // Ambulances
  getAmbulances() {
    return this.request<{ results: Ambulance[] }>('/ambulances/');
  }

  updateAmbulanceStatus(id: number, status: string) {
    return this.request<Ambulance>(`/ambulances/${id}/status/`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  }

  manageAmbulanceEquipment(id: number, equipment: any[]) {
    return this.request<Ambulance>(`/ambulances/${id}/equipment/`, {
      method: 'PUT',
      body: JSON.stringify(equipment),
    });
  }

  assignAmbulance(emergencyId: number, ambulanceId: number) {
    return this.request<Ambulance>('/ambulances/assign/', {
      method: 'POST',
      body: JSON.stringify({ emergency_id: emergencyId, ambulance_id: ambulanceId }),
    });
  }

  // Hospitals
  getHospitals() {
    return this.request<{ results: Hospital[] }>('/hospitals/');
  }

  updateHospitalResources(id: number, resources: any[]) {
    return this.request<Hospital>(`/hospitals/${id}/resources/`, {
      method: 'PATCH',
      body: JSON.stringify(resources),
    });
  }

  // Hospital Alerts
  getHospitalAlerts() {
    return this.request<{ results: HospitalAlert[] }>('/hospital-alerts/');
  }

  acknowledgeAlert(id: number) {
    return this.request<HospitalAlert>(`/hospital-alerts/${id}/acknowledge/`, {
      method: 'POST',
    });
  }

  prepareAlert(id: number) {
    return this.request<HospitalAlert>(`/hospital-alerts/${id}/prepare/`, {
      method: 'POST',
    });
  }

  readyAlert(id: number) {
    return this.request<HospitalAlert>(`/hospital-alerts/${id}/ready/`, {
      method: 'POST',
    });
  }

  notReadyAlert(id: number, reason: string) {
    return this.request<{ alert: HospitalAlert; reassignment: any }>(`/hospital-alerts/${id}/not-ready/`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  // Optimization
  optimizeAmbulances(emergencyId: number, strategy: string, requiredCapability?: string, requiredEquipment?: string[]) {
    return this.request<OptimizeAmbulanceResponse>('/optimization/ambulance/', {
      method: 'POST',
      body: JSON.stringify({
        emergency_id: emergencyId,
        strategy,
        required_capability: requiredCapability,
        required_equipment: requiredEquipment,
      }),
    });
  }

  optimizeHospitals(emergencyId: number, strategy: string, requiredResources?: any[]) {
    return this.request<OptimizeHospitalResponse>('/optimization/hospital/', {
      method: 'POST',
      body: JSON.stringify({
        emergency_id: emergencyId,
        strategy,
        required_resources: requiredResources,
      }),
    });
  }

  // Routes
  optimizeRoute(emergencyId: number, ambulanceId?: number, strategy: string = 'baseline') {
    return this.request<OptimizedRoute>('/routes/optimize/', {
      method: 'POST',
      body: JSON.stringify({
        emergency_id: emergencyId,
        ambulance_id: ambulanceId,
        strategy,
      }),
    });
  }

  recalculateRoute(emergencyId: number, strategy?: string) {
    return this.request<{ rerouted: boolean; route: any; old_eta_min: number; new_eta_min: number }>('/routes/recalculate/', {
      method: 'POST',
      body: JSON.stringify({
        emergency_id: emergencyId,
        strategy,
      }),
    });
  }

  // Handovers
  getHandovers() {
    return this.request<{ results: Handover[] }>('/handovers/');
  }

  startHandover(emergencyId: number, ambulanceId?: number, hospitalId?: number) {
    return this.request<Handover>('/handovers/start/', {
      method: 'POST',
      body: JSON.stringify({
        emergency_id: emergencyId,
        ambulance_id: ambulanceId,
        hospital_id: hospitalId,
      }),
    });
  }

  submitHandover(id: number, notes: string) {
    return this.request<Handover>(`/handovers/${id}/submit/`, {
      method: 'POST',
      body: JSON.stringify({ notes }),
    });
  }

  acceptHandover(id: number) {
    return this.request<Handover>(`/handovers/${id}/accept/`, {
      method: 'POST',
    });
  }

  completeHandover(id: number) {
    return this.request<Handover>(`/handovers/${id}/complete/`, {
      method: 'POST',
    });
  }

  // Asset change requests
  getAssetChangeRequests() {
    return this.request<{ results: AssetChangeRequest[] }>('/asset-change-requests/');
  }

  createAssetChangeRequest(data: any) {
    return this.request<AssetChangeRequest>('/asset-change-requests/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  approveAssetChangeRequest(id: number) {
    return this.request<AssetChangeRequest>(`/asset-change-requests/${id}/approve/`, {
      method: 'POST',
    });
  }

  rejectAssetChangeRequest(id: number, reason: string) {
    return this.request<AssetChangeRequest>(`/asset-change-requests/${id}/reject/`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }
}

export const apiClient = new ApiClient();
