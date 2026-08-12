import { SupabaseClient } from '@supabase/supabase-js';
import { Result } from '@/src/core/domain/result';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { IProductRepository, DeleteProductOutcome } from '../../domain/repository/product.repository';
import { Product, ProductType, MeasureUnit, ValuationMethod, VatType, SaleCurrency } from '../../domain/product';
import { normalizeCurrencyCode } from '../../../shared/currency';

type RawProduct = { id:string|null; company_id:string; code:string|null; barcode:string|null; name:string; description:string|null; type:ProductType; measure_unit:MeasureUnit; valuation_method:ValuationMethod; current_stock:number|null; average_cost:number|null; active:boolean|null; department_id:string|null; vat_type:VatType|null; custom_fields:Record<string,unknown>|null; sale_price_mode:'fixed'|'markup'|null; sale_price_value:number|null; sale_price_currency:SaleCurrency|null; sale_price_currency_code:SaleCurrency|null; created_at:string|null; updated_at:string|null };

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

      return Result.success(rows.map(r => this.map(r)));
    } catch(e){return Result.fail(e instanceof Error?e.message:'Failed to fetch products');}
  }
  async upsert(p:Product):Promise<Result<Product>> {
    try {
      const barcode = p.barcode?.trim() || null;
      let id = p.id;

      // Imports can start while the browser still has an old catalog snapshot.
      // Resolve business identity in the adapter so an existing inactive or
      // active product is updated/reactivated instead of colliding on barcode.
      if (!id && barcode) {
        const { data, error } = await this.source.instance
          .from('shared_inventory_products')
          .select('id')
          .eq('tenant_id', this.tenantId)
          .eq('company_id', p.companyId)
          .eq('barcode', barcode)
          .maybeSingle();
        if (error) return Result.fail(error.message);
        id = (data as { id?: string } | null)?.id;
      }
      if (!id && p.code) {
        const { data, error } = await this.source.instance
          .from('shared_inventory_products')
          .select('id')
          .eq('tenant_id', this.tenantId)
          .eq('company_id', p.companyId)
          .eq('code', p.code)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();
        if (error) return Result.fail(error.message);
        id = (data as { id?: string } | null)?.id;
      }

      const currency = p.salePricing ? normalizeCurrencyCode(p.salePricing.currency) : null;
      const {data,error}=await this.source.instance.from('shared_inventory_products').upsert({tenant_id:this.tenantId,id:id??crypto.randomUUID(),company_id:p.companyId,code:p.code,barcode,name:p.name,description:p.description,type:p.type,measure_unit:p.measureUnit,valuation_method:p.valuationMethod,current_stock:p.currentStock,average_cost:p.averageCost,active:p.active,department_id:p.departmentId??null,vat_type:p.vatType,custom_fields:p.customFields??{},sale_price_mode:p.salePricing?.mode??null,sale_price_value:p.salePricing?(p.salePricing.mode==='fixed'?p.salePricing.amount:p.salePricing.percentage):null,sale_price_currency:currency==='VES'?'B':currency==='USD'?'D':null,sale_price_currency_code:currency,updated_at:new Date().toISOString()},{onConflict:'tenant_id,id'}).select('*').single();
      if(error)return Result.fail(error.code==='23505'?'El código de barras ya está asignado a otro producto de esta empresa':error.message);
      return Result.success(this.map(data as RawProduct));
    } catch(e){return Result.fail(e instanceof Error?e.message:'Failed to save product');}
  }
  async setStock(companyId:string,productId:string,newStock:number):Promise<Result<Product>> { if(newStock<0)return Result.fail('Stock must be non-negative'); try { const {data,error}=await this.source.instance.from('shared_inventory_products').update({current_stock:newStock,updated_at:new Date().toISOString()}).eq('tenant_id',this.tenantId).eq('company_id',companyId).eq('id',productId).select('*').single(); if(error)return Result.fail(error.message); return Result.success(this.map(data as RawProduct)); } catch(e){return Result.fail(e instanceof Error?e.message:'Failed to set product stock');} }
  async delete(id:string):Promise<Result<DeleteProductOutcome>> { try { const {error}=await this.source.instance.from('shared_inventory_products').update({active:false,updated_at:new Date().toISOString()}).eq('tenant_id',this.tenantId).eq('id',id); return error?Result.fail(error.message):Result.success({softDeleted:true}); } catch(e){return Result.fail(e instanceof Error?e.message:'Failed to delete product');} }
  private map(r:RawProduct & {shared_inventory_departments?:{name:string}|null}):Product { const currency=normalizeCurrencyCode(r.sale_price_currency_code??r.sale_price_currency); return {id:r.id??undefined,companyId:r.company_id,code:r.code??'',barcode:r.barcode??undefined,name:r.name,description:r.description??'',type:r.type,measureUnit:r.measure_unit,valuationMethod:r.valuation_method,currentStock:Number(r.current_stock??0),averageCost:Number(r.average_cost??0),active:Boolean(r.active??true),departmentId:r.department_id??undefined,departmentName:r.shared_inventory_departments?.name,vatType:r.vat_type==='exento'?'exento':'general',customFields:r.custom_fields&&Object.keys(r.custom_fields).length?r.custom_fields:undefined,salePricing:r.sale_price_mode==='fixed'&&r.sale_price_value!=null?{mode:'fixed',amount:Number(r.sale_price_value),currency}:r.sale_price_mode==='markup'&&r.sale_price_value!=null?{mode:'markup',percentage:Number(r.sale_price_value),currency}:undefined,createdAt:r.created_at??undefined,updatedAt:r.updated_at??undefined}; }
}
