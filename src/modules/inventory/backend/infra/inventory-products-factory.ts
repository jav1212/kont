// inventory-productos-factory — wires product and department use cases.
// Role: sub-factory for the Products domain slice of inventory.
// Consumers: inventory-factory.ts (aggregator) — do not import directly in API routes.
import { ServerSupabaseSource }       from '@/src/shared/backend/source/infra/server-supabase';
import { RpcProductRepository }       from './repository/rpc-product.repository';
import { RpcDepartmentRepository }    from './repository/rpc-department.repository';
import { ListProductsUseCase }        from '../app/list-products.use-case';
import { SaveProductUseCase }         from '../app/save-product.use-case';
import { DeleteProductUseCase }       from '../app/delete-product.use-case';
import { ListDepartmentsUseCase }     from '../app/list-departments.use-case';
import { SaveDepartmentUseCase }      from '../app/save-department.use-case';
import { DeleteDepartmentUseCase }    from '../app/delete-department.use-case';

export function getInventoryProductsActions(userId: string) {
    const source         = new ServerSupabaseSource();
    const productRepo    = new RpcProductRepository(source, userId);
    const departmentRepo = new RpcDepartmentRepository(source, userId);

    return {
        listProducts:      new ListProductsUseCase(productRepo),
        saveProduct:       new SaveProductUseCase(productRepo),
        deleteProduct:     new DeleteProductUseCase(productRepo),
        listDepartments:   new ListDepartmentsUseCase(departmentRepo),
        saveDepartment:    new SaveDepartmentUseCase(departmentRepo),
        deleteDepartment:  new DeleteDepartmentUseCase(departmentRepo),
    };
}
