import{GetInventoryDashboard}from"@kontave/inventory-application";
import{createSupabaseInventoryDashboardReader}from"@kontave/inventory-supabase";
export function createInventoryDashboardActions(){const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)throw new Error("Native inventory dashboard infrastructure is not configured.");return{get:new GetInventoryDashboard(createSupabaseInventoryDashboardReader({url,serviceRoleKey:key}))};}
