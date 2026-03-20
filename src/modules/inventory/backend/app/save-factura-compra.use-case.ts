import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { FacturaCompra, FacturaCompraItem } from '../domain/factura-compra';
import { IFacturaCompraRepository } from '../domain/repository/factura-compra.repository';

interface Input {
    factura: FacturaCompra;
    items: FacturaCompraItem[];
}

export class SaveFacturaCompraUseCase extends UseCase<Input, FacturaCompra> {
    constructor(private readonly repo: IFacturaCompraRepository) { super(); }

    async execute({ factura, items }: Input): Promise<Result<FacturaCompra>> {
        if (!factura.empresaId) return Result.fail('empresa_id es requerido');
        if (!factura.proveedorId) return Result.fail('proveedor_id es requerido');
        if (!items || items.length === 0) return Result.fail('La factura debe tener al menos un ítem');
        return this.repo.save(factura, items);
    }
}
