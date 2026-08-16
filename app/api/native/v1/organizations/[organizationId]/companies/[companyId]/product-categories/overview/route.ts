import { ProductCategoryStatus,ProductFailure } from "@kontave/products-domain";
import { executeProductRequest,productsRead } from "@/src/native-api/v1/products/product-http";
import { toNativeProductCategoryOverviewDto } from "@/src/native-api/v1/products/product-mapper";
type Context={params:Promise<{organizationId:string;companyId:string}>};
export const dynamic="force-dynamic";
export async function GET(request:Request,routeContext:Context){const params=await routeContext.params,url=new URL(request.url);return executeProductRequest(request,params.organizationId,params.companyId,productsRead,async(actions,context)=>toNativeProductCategoryOverviewDto(await actions.categoryOverview.execute({...context,search:url.searchParams.get("search"),status:one(url,"status",["active","inactive","all"],"all") as ProductCategoryStatus|"all",sort:one(url,"sort",["name","products","updatedAt"],"name"),direction:one(url,"direction",["asc","desc"],"asc"),cursor:url.searchParams.get("cursor"),limit:limit(url)})));}
function one<T extends string>(url:URL,key:string,allowed:readonly T[],fallback:T):T{const value=url.searchParams.get(key)??fallback;if(!allowed.includes(value as T))throw new ProductFailure("PRODUCT_CATEGORY_INVALID",`${key} no es válido.`);return value as T;}
function limit(url:URL){const value=Number(url.searchParams.get("limit")??25);if(!Number.isSafeInteger(value))throw new ProductFailure("PRODUCT_CATEGORY_INVALID","limit no es válido.");return value;}
