import { Result } from '@/src/core/domain/result';
import { FacturaCompra, FacturaCompraItem } from '../factura-compra';

export interface IFacturaCompraRepository {
  findByEmpresa(empresaId: string): Promise<Result<FacturaCompra[]>>;
  findById(facturaId: string): Promise<Result<FacturaCompra>>;
  save(factura: FacturaCompra, items: FacturaCompraItem[]): Promise<Result<FacturaCompra>>;
  confirmar(facturaId: string): Promise<Result<FacturaCompra>>;
}
