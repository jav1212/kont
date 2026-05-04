// Domain entity: Supplier
// Represents a purchase supplier in the inventory module.
export interface Supplier {
  id?: string;
  companyId: string;
  rif: string;
  name: string;
  contact: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}
