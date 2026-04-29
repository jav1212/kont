// save-stock-adjustment.use-case — persiste un ajuste directo de existencia
// modificando product.existencia_actual vía la RPC dedicada
// `tenant_inventario_productos_set_existencia`. NO crea movimientos en el
// kardex: el historial queda intacto y sólo el saldo del producto cambia.
//
// Importante: el RPC genérico `tenant_inventario_productos_upsert` excluye
// existencia_actual del DO UPDATE como protección contra escrituras accidentales
// del saldo desde la edición de metadata. Por eso aquí usamos setStock(), que
// está diseñado específicamente para esta operación.
import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { IProductRepository } from '../domain/repository/product.repository';
import { Product } from '../domain/product';

export interface SaveStockAdjustmentItem {
    productId:        string;
    newCurrentStock:  number;
}

export interface SaveStockAdjustmentInput {
    companyId: string;
    items:     SaveStockAdjustmentItem[];
}

export interface SaveStockAdjustmentOutput {
    updated:  Product[];
    failed:   Array<{ productId: string; error: string }>;
}

export class SaveStockAdjustmentUseCase
    extends UseCase<SaveStockAdjustmentInput, SaveStockAdjustmentOutput> {

    constructor(private readonly productRepo: IProductRepository) { super(); }

    async execute(input: SaveStockAdjustmentInput): Promise<Result<SaveStockAdjustmentOutput>> {
        const { companyId, items } = input;
        if (!companyId)       return Result.fail('companyId es requerido');
        if (!items?.length)   return Result.fail('Se requiere al menos un producto a ajustar');

        const updated: Product[] = [];
        const failed: SaveStockAdjustmentOutput['failed'] = [];

        for (const item of items) {
            if (!item.productId) {
                failed.push({ productId: item.productId ?? '', error: 'productId requerido' });
                continue;
            }
            if (!Number.isFinite(item.newCurrentStock) || item.newCurrentStock < 0) {
                failed.push({ productId: item.productId, error: 'newCurrentStock debe ser un número ≥ 0' });
                continue;
            }

            const setRes = await this.productRepo.setStock(companyId, item.productId, item.newCurrentStock);
            if (setRes.isFailure) {
                failed.push({ productId: item.productId, error: setRes.getError() });
            } else {
                updated.push(setRes.getValue());
            }
        }

        return Result.success({ updated, failed });
    }
}
