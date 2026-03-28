// Domain entity: Department
// Represents an inventory department used to group products.
export interface Department {
  id?: string;
  companyId: string;
  name: string;
  description?: string;
  active: boolean;
  createdAt?: string;
}
