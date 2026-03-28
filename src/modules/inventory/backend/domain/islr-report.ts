// Domain value objects: IslrMovement, IslrProduct
// Used for the ISLR Art. 177 inventory report.
export interface IslrMovement {
  id: string;
  date: string;       // YYYY-MM-DD
  reference: string;
  type: string;
  inboundQuantity: number;
  outboundQuantity: number;
  balanceQuantity: number;
  inboundCost: number;
  outboundCost: number;
  balanceCost: number;
}

export interface IslrProduct {
  productId: string;
  productCode: string;
  productName: string;
  openingQuantity: number;
  openingCost: number;
  movements: IslrMovement[];
}
