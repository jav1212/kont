import { SupabaseClient } from '@supabase/supabase-js';
import { Result } from '@/src/core/domain/result';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { IProductRepository, DeleteProductOutcome, ProductComposition } from '../../domain/repository/product.repository';
import { Product, ProductComponent, ProductCompositionKind, ProductType, MeasureUnit, ValuationMethod, VatType, SaleCurrency } from '../../domain/product';
import { normalizeCurrencyCode } from '../../../shared/currency';

type RawProduct = { id:string|null; company_id:string; code:string|null; barcode:string|null; name:string; description:string|null; type:ProductType; measure_unit:MeasureUnit; valuation_method:ValuationMethod; current_stock:number|null; average_cost:number|null; active:boolean|null; department_id:string|null; vat_type:VatType|null; custom_fields:Record<string,unknown>|null; sale_price_mode:'fixed'|'markup'|null; sale_price_value:number|null; sale_price_currency:SaleCurrency|null; sale_price_currency_code:SaleCurrency|null; composition_kind:ProductCompositionKind|null; created_at:string|null; updated_at:string|null };
type RawComponent = { product_id:string; quantity:number|string; code:string; name:string; measure_unit:MeasureUnit; current_stock:number|string; active:boolean };
type RawComposition = { product_id:string; company_id:string; composition_kind:ProductCompositionKind; composition_status:'pending'|'ready'; components:RawComponent[] };

export class SharedProductRepository implements IProductRepository {
  constructor(private readonly source: ISource<SupabaseClient>, private readonly tenantId: string) {}

  async findByCompany(companyId:string):Promise<Result<Product[]>> {
    try {
      // PostgREST/Supabase applies a default 1,000-row limit when no range is
      // specified. Read in deterministic pages so catalog totals and imports
      // remain correct for large companies.
      const pageSize = 1_000;
      const rows: (RawProduct & {shared_inventory_departments?:{name:string}|null})[] = [];

      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await this.source.instance
          .from('shared_inventory_products')
          .select('*,shared_inventory_departments(name)')
          .eq('tenant_id', this.tenantId)
          .eq('company_id', companyId)
          .order('name', { ascending: true })
          .order('id', { ascending: true })
          .range(offset, offset + pageSize - 1);
        if (error) return Result.fail(error.message);

        const page = (data as (RawProduct & {shared_inventory_departments?:{name:string}|null})[]) ?? [];
        rows.push(...page);
        if (page.length < pageSize) break;
      }

      const compositeIds = rows.filter((row) => row.composition_kind === 'composite').map((row) => row.id).filter((id): id is string => id !== null);
      const componentsByProduct = new Map<string, ProductComponent[]>();
      if (compositeIds.length) {
        for (let offset = 0; ; offset += pageSize) {
          const { data, error } = await this.source.instance.rpc('shared_inventory_product_components_list', {
            p_tenant_id: this.tenantId, p_product_ids: compositeIds,
          }).range(offset, offset + pageSize - 1);
          if (error) return Result.fail(error.message);
          const page = (data as Array<RawComponent & { composite_product_id: string }> | null) ?? [];
          for (const row of page) {
            const components = componentsByProduct.get(row.composite_product_id) ?? [];
            components.push(this.mapComponent(row));
            componentsByProduct.set(row.composite_product_id, components);
          }
          if (page.length < pageSize) break;
        }
      }
      return Result.success(rows.map((row) => this.map(row, componentsByProduct.get(row.id ?? '') ?? [])));
    } catch(e){return Result.fail(e instanceof Error?e.message:'Failed to fetch products');}
  }
  async upsert(p:Product):Promise<Result<Product>> {
    try {
      const barcode = p.barcode?.trim() || null;
      let id = p.id;
      let existingCompositionKind: ProductCompositionKind | undefined;

      // Imports can start while the browser still has an old catalog snapshot.
      // Resolve business identity in the adapter so an existing inactive or
      // active product is updated/reactivated instead of colliding on barcode.
      if (!id && barcode) {
        const { data, error } = await this.source.instance
          .from('shared_inventory_products')
          .select('id,composition_kind')
          .eq('tenant_id', this.tenantId)
          .eq('company_id', p.companyId)
          .eq('barcode', barcode)
          .maybeSingle();
        if (error) return Result.fail(error.message);
        id = (data as { id?: string; composition_kind?: ProductCompositionKind } | null)?.id;
        existingCompositionKind = (data as { composition_kind?: ProductCompositionKind } | null)?.composition_kind;
      }
      if (!id && p.code) {
        const { data, error } = await this.source.instance
          .from('shared_inventory_products')
          .select('id,composition_kind')
          .eq('tenant_id', this.tenantId)
          .eq('company_id', p.companyId)
          .eq('code', p.code)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();
        if (error) return Result.fail(error.message);
        id = (data as { id?: string; composition_kind?: ProductCompositionKind } | null)?.id;
        existingCompositionKind = (data as { composition_kind?: ProductCompositionKind } | null)?.composition_kind;
      }
      if (id && !p.compositionKind && !existingCompositionKind) {
        const { data, error } = await this.source.instance
          .from('shared_inventory_products')
          .select('composition_kind')
          .eq('tenant_id', this.tenantId)
          .eq('company_id', p.companyId)
          .eq('id', id)
          .maybeSingle();
        if (error) return Result.fail(error.message);
        existingCompositionKind = (data as { composition_kind?: ProductCompositionKind } | null)?.composition_kind;
      }

      const currency = p.salePricing ? normalizeCurrencyCode(p.salePricing.currency) : null;
      const {data,error}=await this.source.instance.from('shared_inventory_products').upsert({tenant_id:this.tenantId,id:id??crypto.randomUUID(),company_id:p.companyId,code:p.code,barcode,name:p.name,description:p.description,type:p.type,measure_unit:p.measureUnit,valuation_method:p.valuationMethod,current_stock:p.currentStock,average_cost:p.averageCost,active:p.active,department_id:p.departmentId??null,vat_type:p.vatType,custom_fields:p.customFields??{},sale_price_mode:p.salePricing?.mode??null,sale_price_value:p.salePricing?(p.salePricing.mode==='fixed'?p.salePricing.amount:p.salePricing.percentage):null,sale_price_currency:currency==='VES'?'B':currency==='USD'?'D':null,sale_price_currency_code:currency,composition_kind:p.compositionKind??existingCompositionKind??'simple',updated_at:new Date().toISOString()},{onConflict:'tenant_id,id'}).select('*').single();
      if(error)return Result.fail(error.code==='23505'?'El código de barras ya está asignado a otro producto de esta empresa':error.message);
      const saved = this.map(data as RawProduct);
      if (saved.compositionKind !== 'composite' || !saved.id) return Result.success(saved);
      const composition = await this.getComposition(saved.companyId, saved.id);
      if (composition.isFailure) return Result.fail(composition.getError());
      const { components, compositionKind, compositionStatus } = composition.getValue();
      return Result.success({ ...saved, components, compositionKind, compositionStatus });
    } catch(e){return Result.fail(e instanceof Error?e.message:'Failed to save product');}
  }
  async setStock(companyId:string,productId:string,newStock:number):Promise<Result<Product>> { if(newStock<0)return Result.fail('Stock must be non-negative'); try { const {data,error}=await this.source.instance.from('shared_inventory_products').update({current_stock:newStock,updated_at:new Date().toISOString()}).eq('tenant_id',this.tenantId).eq('company_id',companyId).eq('id',productId).select('*').single(); if(error)return Result.fail(error.message); return Result.success(this.map(data as RawProduct)); } catch(e){return Result.fail(e instanceof Error?e.message:'Failed to set product stock');} }
  /**
   * Returns a recipe in the current tenant and company scope.
   * @param companyId Company that owns the product.
   * @param productId Product whose recipe is requested.
   * @returns Resolved recipe detail or an expected persistence failure.
   */
  async getComposition(companyId: string, productId: string): Promise<Result<ProductComposition>> {
    return this.callComposition('shared_inventory_product_composition_get', {
      p_tenant_id: this.tenantId,
      p_company_id: companyId,
      p_product_id: productId,
    });
  }

  /**
   * Replaces one composite product's entire recipe in a database transaction.
   * @param companyId Company that owns the parent and every component.
   * @param productId Composite product identifier.
   * @param components Complete list of component identifiers and quantities.
   * @returns Resolved persisted recipe or an expected validation failure.
   */
  async replaceComposition(
    companyId: string,
    productId: string,
    components: Array<Pick<ProductComponent, 'productId' | 'quantity'>>,
  ): Promise<Result<ProductComposition>> {
    return this.callComposition('shared_inventory_product_composition_replace', {
      p_tenant_id: this.tenantId,
      p_company_id: companyId,
      p_product_id: productId,
      p_components: components.map((component) => ({
        productId: component.productId,
        quantity: component.quantity,
      })),
    });
  }
  async delete(id:string):Promise<Result<DeleteProductOutcome>> { try { const {error}=await this.source.instance.from('shared_inventory_products').update({active:false,updated_at:new Date().toISOString()}).eq('tenant_id',this.tenantId).eq('id',id); return error?Result.fail(error.message):Result.success({softDeleted:true}); } catch(e){return Result.fail(e instanceof Error?e.message:'Failed to delete product');} }
  private async callComposition(name: string, args: Record<string, unknown>): Promise<Result<ProductComposition>> {
    try {
      const { data, error } = await this.source.instance.rpc(name, args);
      if (error) return Result.fail(error.message);
      const row = data as RawComposition;
      return Result.success({
        productId: row.product_id,
        companyId: row.company_id,
        compositionKind: row.composition_kind,
        compositionStatus: row.composition_status,
        components: (row.components ?? []).map((component) => this.mapComponent(component)),
      });
    } catch (error) {
      return Result.fail(error instanceof Error ? error.message : 'Failed to manage product composition');
    }
  }

  private mapComponent(row: RawComponent): ProductComponent {
    return {
      productId: row.product_id,
      quantity: Number(row.quantity),
      code: row.code,
      name: row.name,
      measureUnit: row.measure_unit,
      currentStock: Number(row.current_stock),
      active: row.active,
    };
  }
  private map(r:RawProduct & {shared_inventory_departments?:{name:string}|null},components:ProductComponent[]=[]):Product { const currency=normalizeCurrencyCode(r.sale_price_currency_code??r.sale_price_currency); const compositionKind=r.composition_kind==='composite'?'composite':'simple'; return {id:r.id??undefined,companyId:r.company_id,code:r.code??'',barcode:r.barcode??undefined,name:r.name,description:r.description??'',type:r.type,measureUnit:r.measure_unit,valuationMethod:r.valuation_method,currentStock:Number(r.current_stock??0),averageCost:Number(r.average_cost??0),active:Boolean(r.active??true),departmentId:r.department_id??undefined,departmentName:r.shared_inventory_departments?.name,vatType:r.vat_type==='exento'?'exento':'general',customFields:r.custom_fields&&Object.keys(r.custom_fields).length?r.custom_fields:undefined,salePricing:r.sale_price_mode==='fixed'&&r.sale_price_value!=null?{mode:'fixed',amount:Number(r.sale_price_value),currency}:r.sale_price_mode==='markup'&&r.sale_price_value!=null?{mode:'markup',percentage:Number(r.sale_price_value),currency}:undefined,compositionKind,compositionStatus:compositionKind==='composite'?(components.length?'ready':'pending'):'ready',components,createdAt:r.created_at??undefined,updatedAt:r.updated_at??undefined}; }
}
