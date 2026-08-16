import type { ProductCursorPage,ProductDetail } from "@kontave/products-application";
import type { ProductCategory } from "@kontave/products-domain";
import type { NativeProductCategoryDto,NativeProductDetailDto,NativeProductDto,NativeProductListDto } from "@kontave/native-api-contracts";
export function toNativeProductCategoryDto(value:ProductCategory):NativeProductCategoryDto{return{id:value.id,name:value.name,description:value.description,status:value.status,version:value.version};}
export function toNativeProductDto(value:ProductDetail):NativeProductDto{return{id:value.product.id,sku:value.product.sku,barcodes:value.product.barcodes,name:value.product.name,description:value.product.description,category:value.category?toNativeProductCategoryDto(value.category):null,baseUnit:value.product.baseUnit,status:value.product.status,inventory:value.inventory,updatedAt:value.updatedAt,version:value.product.version};}
export function toNativeProductDetailDto(value:ProductDetail):NativeProductDetailDto{return{...toNativeProductDto(value),capabilities:value.capabilities};}
export function toNativeProductListDto(value:ProductCursorPage):NativeProductListDto{return{items:value.items.map(item=>toNativeProductDto({...item,capabilities:{inventoryEnabled:item.inventory!==null,locationTracking:false,lotTracking:false}})),nextCursor:value.nextCursor,total:value.total,summary:value.summary};}
