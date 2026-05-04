// Domain entity: Customer
// Counterpart of Supplier — used in sales invoices.
export interface Customer {
    id?:        string;
    companyId:  string;
    rif:        string;
    name:       string;
    contact:    string;
    phone:      string;
    email:      string;
    address:    string;
    notes:      string;
    active:     boolean;
    createdAt?: string;
    updatedAt?: string;
}
