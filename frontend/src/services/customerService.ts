import api from './api';
import type { User, CreateCustomerRequest, CustomerListResponse } from '../types';

export const customerService = {
  async getCustomers(search?: string, page = 1, pageSize = 50): Promise<CustomerListResponse> {
    const res = await api.get<CustomerListResponse>('/api/customers', {
      params: {
        page,
        page_size: pageSize,
        ...(search ? { search } : {}),
      },
    });
    return res.data;
  },

  async createCustomer(data: CreateCustomerRequest): Promise<User> {
    const res = await api.post<User>('/api/customers', data);
    return res.data;
  },

  async getCustomerById(id: string): Promise<User> {
    const res = await api.get<User>(`/api/customers/${id}`);
    return res.data;
  },
};

export default customerService;
